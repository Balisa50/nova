"""
CTGAN implemented from scratch in PyTorch (Xu et al., 2019,
"Modeling Tabular Data using Conditional GAN", NeurIPS 32).

No `sdv` / `ctgan` library is imported -- only torch, numpy, pandas. The pieces:

  * DataSampler         -- training-by-sampling: builds conditional vectors and
                           draws real rows matching a (column, category) so the
                           critic sees the same condition as the generator.
                           Categories are sampled by log-frequency to stop rare
                           categories (e.g. defaulters) from collapsing.
  * Residual / Generator-- residual MLP that emits one block per column and is
                           activated with tanh (continuous alpha) + gumbel-
                           softmax (mode/category one-hots).
  * Discriminator       -- PacGAN critic (packs `pac` rows) with LeakyReLU +
                           Dropout and a WGAN gradient penalty.
  * CTGAN               -- fit / sample / save / load orchestration with the
                           WGAN-GP training loop and a conditional CE term.

The model consumes the DataTransformer layout from synthfin.preprocessing.
"""

from __future__ import annotations

import copy

import numpy as np
import torch
from scipy.stats import ks_2samp
from torch import nn, optim
from torch.nn import functional as F

from .preprocessing import DataTransformer


# --------------------------------------------------------------------------- #
# Conditional sampler (training-by-sampling)
# --------------------------------------------------------------------------- #
class DataSampler:
    """Builds conditional vectors and samples real rows by category."""

    def __init__(self, transformed: np.ndarray, transformer: DataTransformer,
                 cond_temp: float = 1.0):
        self._data = transformed
        # cond_temp tempers category sampling during training: p ~ freq**temp.
        # temp=1 -> true frequency (no marginal bias); temp->0 -> uniform (helps
        # rare classes but inflates their marginals). We use 1.0 because the
        # log-frequency scheme (~temp 0) badly inflated the default rate.
        self.cond_temp = cond_temp
        spans = transformer.discrete_column_spans          # [(start, length)]
        self._n_discrete = len(spans)
        self._span_start = np.array([s for s, _ in spans], dtype=int)
        self._span_len = np.array([l for _, l in spans], dtype=int)
        self.cond_dim = int(self._span_len.sum())

        # Row ids per (discrete column, category) for conditioned real sampling.
        self._rid_by_cat = []
        # Per-column category sampling probabilities (tempered frequency).
        self._cat_prob = []
        # Per-column start offset inside the flat cond vector.
        self._cond_start = np.zeros(self._n_discrete, dtype=int)

        # Flat (col, cat) frequency table for generation-time cond vectors.
        flat_freq = []
        cond_offset = 0
        for c, (start, length) in enumerate(spans):
            self._cond_start[c] = cond_offset
            cond_offset += length
            onehot = transformed[:, start:start + length]
            cat_idx = onehot.argmax(axis=1)
            rids = [np.where(cat_idx == k)[0] for k in range(length)]
            self._rid_by_cat.append(rids)
            freq = np.array([max(len(r), 1) for r in rids], dtype=float)
            tempered = freq ** self.cond_temp
            self._cat_prob.append(tempered / tempered.sum())
            for k in range(length):
                flat_freq.append((c, k, len(rids[k])))

        self._flat = flat_freq
        flat_counts = np.array([f[2] for f in flat_freq], dtype=float)
        self._flat_prob = flat_counts / flat_counts.sum() if flat_counts.sum() > 0 else None
        self.rng = np.random.default_rng(0)

    # ---- training cond vectors (tempered-frequency category sampling) ---- #
    def sample_condvec(self, batch: int):
        if self._n_discrete == 0:
            return None
        cols = self.rng.integers(0, self._n_discrete, size=batch)
        cond = np.zeros((batch, self.cond_dim), dtype="float32")
        mask = np.zeros((batch, self._n_discrete), dtype="float32")
        cats = np.zeros(batch, dtype=int)
        for i, c in enumerate(cols):
            k = self.rng.choice(self._span_len[c], p=self._cat_prob[c])
            cats[i] = k
            cond[i, self._cond_start[c] + k] = 1.0
            mask[i, c] = 1.0
        return cond, mask, cols, cats

    # ---- generation cond vectors (true marginal frequency) ---- #
    def sample_original_condvec(self, batch: int):
        if self._n_discrete == 0:
            return None
        picks = self.rng.choice(len(self._flat), size=batch, p=self._flat_prob)
        cond = np.zeros((batch, self.cond_dim), dtype="float32")
        for i, p in enumerate(picks):
            c, k, _ = self._flat[p]
            cond[i, self._cond_start[c] + k] = 1.0
        return cond

    # ---- real rows matching given conditions ---- #
    def sample_data(self, batch: int, cols=None, cats=None) -> np.ndarray:
        if cols is None:
            idx = self.rng.integers(0, len(self._data), size=batch)
            return self._data[idx]
        idx = np.empty(batch, dtype=int)
        for i in range(batch):
            pool = self._rid_by_cat[cols[i]][cats[i]]
            idx[i] = pool[self.rng.integers(0, len(pool))] if len(pool) else \
                self.rng.integers(0, len(self._data))
        return self._data[idx]


# --------------------------------------------------------------------------- #
# Networks
# --------------------------------------------------------------------------- #
class Residual(nn.Module):
    """Linear -> BatchNorm -> ReLU, output concatenated with the input."""

    def __init__(self, in_dim: int, out_dim: int):
        super().__init__()
        self.fc = nn.Linear(in_dim, out_dim)
        self.bn = nn.BatchNorm1d(out_dim)

    def forward(self, x):
        out = F.relu(self.bn(self.fc(x)))
        return torch.cat([out, x], dim=1)


class Generator(nn.Module):
    """Residual MLP: latent+cond -> transformed-data dimensionality."""

    def __init__(self, latent_dim: int, cond_dim: int, data_dim: int,
                 hidden=(256, 256)):
        # (256, 256) residual blocks are the canonical CTGAN generator
        # (Xu et al. 2019 / SDV). A wider (256, 512, 1024) tower is available by
        # passing `hidden=` but is ~5x slower on CPU for no measurable quality
        # gain at this data scale.
        super().__init__()
        dim = latent_dim + cond_dim
        layers = []
        for h in hidden:
            layers.append(Residual(dim, h))
            dim += h
        self.backbone = nn.Sequential(*layers)
        self.out = nn.Linear(dim, data_dim)

    def forward(self, z, cond=None):
        x = z if cond is None else torch.cat([z, cond], dim=1)
        return self.out(self.backbone(x))


class Discriminator(nn.Module):
    """PacGAN critic with LeakyReLU + Dropout and a WGAN gradient penalty."""

    def __init__(self, input_dim: int, pac: int = 8, hidden=(256, 256),
                 dropout: float = 0.5):
        super().__init__()
        self.pac = pac
        self.pacdim = input_dim * pac
        dim = self.pacdim
        layers = []
        for h in hidden:
            layers += [nn.Linear(dim, h), nn.LeakyReLU(0.2), nn.Dropout(dropout)]
            dim = h
        layers.append(nn.Linear(dim, 1))
        self.model = nn.Sequential(*layers)

    def forward(self, x):
        assert x.size(0) % self.pac == 0
        return self.model(x.view(-1, self.pacdim))

    def gradient_penalty(self, real, fake, device, lambda_=10.0):
        b = real.size(0) // self.pac
        alpha = torch.rand(b, 1, 1, device=device).repeat(1, self.pac, real.size(1))
        alpha = alpha.view(-1, real.size(1))
        interp = (alpha * real + (1 - alpha) * fake).requires_grad_(True)
        d_interp = self(interp)
        grads = torch.autograd.grad(
            outputs=d_interp, inputs=interp,
            grad_outputs=torch.ones_like(d_interp),
            create_graph=True, retain_graph=True, only_inputs=True,
        )[0]
        grads = grads.view(-1, self.pac * real.size(1))
        return (((grads.norm(2, dim=1) - 1) ** 2).mean()) * lambda_


# --------------------------------------------------------------------------- #
# CTGAN
# --------------------------------------------------------------------------- #
class CTGAN:
    def __init__(self, latent_dim: int = 128, batch_size: int = 512,
                 epochs: int = 300, pac: int = 8, generator_lr: float = 1e-4,
                 discriminator_lr: float = 5e-5, discriminator_steps: int = 1,
                 gumbel_tau: float = 0.2, max_modes: int = 10,
                 early_stop: bool = True, min_epochs: int = 60,
                 eval_every: int = 10, patience: int = 4, eval_n: int = 1500,
                 device: str | None = None, seed: int = 0, verbose: bool = True):
        if batch_size % pac != 0:
            raise ValueError(f"batch_size ({batch_size}) must be divisible by pac ({pac}).")
        self.latent_dim = latent_dim
        self.batch_size = batch_size
        self.epochs = epochs
        self.pac = pac
        self.generator_lr = generator_lr
        self.discriminator_lr = discriminator_lr
        self.discriminator_steps = discriminator_steps
        self.gumbel_tau = gumbel_tau
        self.max_modes = max_modes
        self.early_stop = early_stop
        self.min_epochs = min_epochs
        self.eval_every = eval_every
        self.patience = patience
        self.eval_n = eval_n
        self.seed = seed
        self.verbose = verbose
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))

        self.transformer: DataTransformer | None = None
        self.sampler: DataSampler | None = None
        self.generator: Generator | None = None
        self.discriminator: Discriminator | None = None
        self.loss_history: list[dict] = []
        self._activation_spans: list[tuple[int, int, str]] = []  # (start, dim, act)
        self._discrete_index: dict = {}  # {column_name: (discrete_idx, categories)}

    # ----------------------------- fit --------------------------------- #
    def fit(self, df, discrete_columns, continuous_columns=None):
        torch.manual_seed(self.seed)
        np.random.seed(self.seed)

        self.transformer = DataTransformer(max_modes=self.max_modes, seed=self.seed)
        self.transformer.fit(df, discrete_columns)
        data = self.transformer.transform(df)
        self.sampler = DataSampler(data, self.transformer)
        self._build_activation_spans()
        self._discrete_index = self._build_discrete_index()

        # Held-aside real subsample + continuous columns for early-stop scoring.
        cont_cols = [i.column_name for i in self.transformer.column_transform_info
                     if i.column_type == "continuous"]
        eval_real = df.sample(min(self.eval_n, len(df)), random_state=self.seed).reset_index(drop=True)
        best_score, best_state, stale = float("inf"), None, 0

        data_dim = self.transformer.output_dimensions
        cond_dim = self.sampler.cond_dim

        self.generator = Generator(self.latent_dim, cond_dim, data_dim).to(self.device)
        self.discriminator = Discriminator(data_dim + cond_dim, pac=self.pac).to(self.device)

        opt_g = optim.Adam(self.generator.parameters(), lr=self.generator_lr,
                           betas=(0.5, 0.9), weight_decay=1e-6)
        opt_d = optim.Adam(self.discriminator.parameters(), lr=self.discriminator_lr,
                           betas=(0.5, 0.9), weight_decay=1e-6)

        steps_per_epoch = max(len(data) // self.batch_size, 1)
        mean = torch.zeros(self.batch_size, self.latent_dim, device=self.device)
        std = mean + 1

        for epoch in range(self.epochs):
            g_losses, d_losses = [], []
            for _ in range(steps_per_epoch):
                # ---------- critic ----------
                for _ in range(self.discriminator_steps):
                    d_loss = self._discriminator_step(mean, std, opt_d)
                    d_losses.append(d_loss)
                # ---------- generator ----------
                g_loss = self._generator_step(mean, std, opt_g)
                g_losses.append(g_loss)

            rec = {"epoch": epoch + 1,
                   "g_loss": float(np.mean(g_losses)),
                   "d_loss": float(np.mean(d_losses))}

            # ---- quality-based early stopping ----
            do_eval = self.early_stop and (epoch + 1) >= self.min_epochs and \
                (epoch + 1) % self.eval_every == 0
            if do_eval:
                score = self._fidelity_score(eval_real, cont_cols)
                rec["ks_mean"] = score
                if score < best_score - 1e-4:
                    best_score, stale = score, 0
                    best_state = copy.deepcopy(self.generator.state_dict())
                else:
                    stale += 1
            self.loss_history.append(rec)

            if self.verbose and (epoch % 10 == 0 or epoch == self.epochs - 1 or do_eval):
                extra = f"  ks={rec.get('ks_mean', float('nan')):.4f}" if "ks_mean" in rec else ""
                print(f"  epoch {epoch + 1:4d}/{self.epochs}  "
                      f"G={rec['g_loss']:+.4f}  D={rec['d_loss']:+.4f}{extra}")

            if self.early_stop and stale >= self.patience:
                if self.verbose:
                    print(f"  early stop at epoch {epoch + 1} "
                          f"(best KS={best_score:.4f})")
                break

        if best_state is not None:
            self.generator.load_state_dict(best_state)  # restore best checkpoint
        return self

    def _fidelity_score(self, eval_real, cont_cols) -> float:
        """Mean KS statistic over continuous columns (lower = closer)."""
        synth = self.sample(len(eval_real))
        stats_ = []
        for c in cont_cols:
            a = eval_real[c].to_numpy(dtype=float)
            b = synth[c].to_numpy(dtype=float)
            stats_.append(ks_2samp(a, b).statistic)
        return float(np.mean(stats_)) if stats_ else float("inf")

    # --------------------- single training steps ----------------------- #
    def _discriminator_step(self, mean, std, opt_d) -> float:
        fakez = torch.normal(mean=mean, std=std)
        condvec = self.sampler.sample_condvec(self.batch_size)
        if condvec is None:
            cond = None
            real = self.sampler.sample_data(self.batch_size)
        else:
            c, m, cols, cats = condvec
            cond = torch.from_numpy(c).to(self.device)
            # shuffle so real conditions are not aligned 1:1 with fake order
            perm = np.arange(self.batch_size)
            np.random.shuffle(perm)
            real = self.sampler.sample_data(self.batch_size, cols[perm], cats[perm])
            cond_perm = cond[perm]

        fake = self._apply_activate(self.generator(fakez, cond))
        real_t = torch.from_numpy(real.astype("float32")).to(self.device)

        if cond is not None:
            fake_cat = torch.cat([fake, cond], dim=1)
            real_cat = torch.cat([real_t, cond_perm], dim=1)
        else:
            fake_cat, real_cat = fake, real_t

        y_fake = self.discriminator(fake_cat)
        y_real = self.discriminator(real_cat)
        gp = self.discriminator.gradient_penalty(real_cat, fake_cat, self.device)
        loss_d = -(torch.mean(y_real) - torch.mean(y_fake)) + gp

        opt_d.zero_grad(set_to_none=True)
        loss_d.backward()
        opt_d.step()
        return float(loss_d.detach().cpu())

    def _generator_step(self, mean, std, opt_g) -> float:
        fakez = torch.normal(mean=mean, std=std)
        condvec = self.sampler.sample_condvec(self.batch_size)
        if condvec is None:
            cond, mask = None, None
        else:
            c, m, _, _ = condvec
            cond = torch.from_numpy(c).to(self.device)
            mask = torch.from_numpy(m).to(self.device)

        fake = self._apply_activate(self.generator(fakez, cond))
        fake_cat = fake if cond is None else torch.cat([fake, cond], dim=1)
        y_fake = self.discriminator(fake_cat)

        cond_loss = 0.0 if cond is None else self._cond_loss(
            self.generator(fakez, cond), c, m)
        loss_g = -torch.mean(y_fake) + cond_loss

        opt_g.zero_grad(set_to_none=True)
        loss_g.backward()
        opt_g.step()
        return float(loss_g.detach().cpu())

    # --------------------------- helpers ------------------------------- #
    def _build_activation_spans(self):
        self._activation_spans = []
        st = 0
        for info in self.transformer.column_transform_info:
            for span in info.output_info:
                self._activation_spans.append((st, span.dim, span.activation))
                st += span.dim

    def _build_discrete_index(self) -> dict:
        idx, d = {}, 0
        for info in self.transformer.column_transform_info:
            if info.column_type == "discrete":
                idx[info.column_name] = (d, info.categories)
                d += 1
        return idx

    def _apply_activate(self, data, gumbel: bool = True):
        parts = []
        for st, dim, act in self._activation_spans:
            chunk = data[:, st:st + dim]
            if act == "tanh":
                parts.append(torch.tanh(chunk))
            elif gumbel:
                parts.append(F.gumbel_softmax(chunk, tau=self.gumbel_tau, hard=False))
            else:
                # Inference: plain softmax (no gumbel noise) for cleaner samples.
                parts.append(F.softmax(chunk, dim=1))
        return torch.cat(parts, dim=1)

    def _cond_loss(self, raw_out, cond_np, mask_np):
        """Cross-entropy pushing the generated conditioned column to its target."""
        mask = torch.from_numpy(mask_np).to(self.device)
        losses = []
        st = 0       # offset in generator output
        st_c = 0     # offset in cond vector
        d = 0        # discrete-column index
        for info in self.transformer.column_transform_info:
            if info.column_type != "discrete":
                st += info.output_dimensions
                continue
            length = info.output_dimensions
            target = torch.from_numpy(
                cond_np[:, st_c:st_c + length]).to(self.device).argmax(dim=1)
            ce = F.cross_entropy(raw_out[:, st:st + length], target, reduction="none")
            losses.append(ce)
            st += length
            st_c += length
            d += 1
        if not losses:
            return torch.zeros(1, device=self.device)
        stacked = torch.stack(losses, dim=1)            # (batch, n_discrete)
        return (stacked * mask).sum() / mask.size(0)

    # --------------------------- sampling ------------------------------ #
    @torch.no_grad()
    def sample(self, n: int, seed: int | None = None,
               condition_column: str | None = None,
               condition_value_probs: dict | None = None) -> "object":
        """Generate `n` synthetic rows.

        If `condition_column` is given (e.g. 'default'), every row is generated
        conditioned on that column, with category labels drawn from
        `condition_value_probs` ({label: prob}). This is how the API honours a
        requested default rate.
        """
        self.generator.eval()
        if seed is not None:
            torch.manual_seed(seed)
            self.sampler.rng = np.random.default_rng(seed)
        rows, made = [], 0
        while made < n:
            b = self.batch_size
            z = torch.normal(0, 1, size=(b, self.latent_dim), device=self.device)
            if condition_column is not None and self.sampler.cond_dim > 0:
                cond = self._conditional_condvec(b, condition_column, condition_value_probs)
            else:
                cond = self.sampler.sample_original_condvec(b)
            cond_t = None if cond is None else torch.from_numpy(cond).to(self.device)
            # Gumbel sampling (not plain softmax) at inference: it samples
            # categories rather than always taking the mode, which empirically
            # gives more diverse, less-distinguishable output.
            fake = self._apply_activate(self.generator(z, cond_t), gumbel=True)
            rows.append(fake.cpu().numpy())
            made += b
        self.generator.train()
        matrix = np.concatenate(rows, axis=0)[:n]
        return self.transformer.inverse_transform(matrix)

    def _conditional_condvec(self, batch: int, column: str, value_probs: dict | None):
        """Build cond vectors forcing one discrete column to a target mix."""
        if column not in self._discrete_index:
            return self.sampler.sample_original_condvec(batch)
        disc_idx, categories = self._discrete_index[column]
        if value_probs:
            p = np.array([float(value_probs.get(c, value_probs.get(str(c), 0.0)))
                          for c in categories], dtype=float)
            p = p / p.sum() if p.sum() > 0 else np.ones(len(categories)) / len(categories)
        else:
            p = np.ones(len(categories)) / len(categories)
        start = self.sampler._cond_start[disc_idx]
        cond = np.zeros((batch, self.sampler.cond_dim), dtype="float32")
        picks = self.sampler.rng.choice(len(categories), size=batch, p=p)
        cond[np.arange(batch), start + picks] = 1.0
        return cond

    # --------------------------- persistence --------------------------- #
    def save(self, path: str):
        torch.save({
            "config": {k: getattr(self, k) for k in (
                "latent_dim", "batch_size", "epochs", "pac", "generator_lr",
                "discriminator_lr", "discriminator_steps", "gumbel_tau",
                "max_modes", "seed")},
            "generator_state": self.generator.state_dict(),
            "discriminator_state": self.discriminator.state_dict(),
            "transformer": self.transformer,
            "loss_history": self.loss_history,
            "activation_spans": self._activation_spans,
        }, path)

    @classmethod
    def load(cls, path: str, device: str | None = None) -> "CTGAN":
        ckpt = torch.load(path, weights_only=False, map_location=device or "cpu")
        model = cls(device=device, verbose=False, **ckpt["config"])
        model.transformer = ckpt["transformer"]
        model._activation_spans = ckpt["activation_spans"]
        model._discrete_index = model._build_discrete_index()
        model.loss_history = ckpt.get("loss_history", [])
        data_dim = model.transformer.output_dimensions
        spans = model.transformer.discrete_column_spans
        cond_dim = int(sum(l for _, l in spans))
        # Rebuild a sampler is only needed for conditional generation; reconstruct
        # it lazily from the transformer's discrete layout (frequencies are not
        # persisted, so sampling uses uniform cond if no data is re-supplied).
        model.generator = Generator(model.latent_dim, cond_dim, data_dim).to(model.device)
        model.discriminator = Discriminator(data_dim + cond_dim, pac=model.pac).to(model.device)
        model.generator.load_state_dict(ckpt["generator_state"])
        model.discriminator.load_state_dict(ckpt["discriminator_state"])
        model.generator.eval()
        return model

    def attach_sampler_from(self, df, discrete_columns):
        """Rebuild the conditional sampler from data (needed after load())."""
        data = self.transformer.transform(df)
        self.sampler = DataSampler(data, self.transformer)

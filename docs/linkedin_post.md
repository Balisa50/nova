# LinkedIn post

---

Banks in West Africa are sitting on the exact data that could widen financial inclusion — and they legally can't share a single row of it.

So the startups and researchers who could build credit and inclusion models have nothing to train on. Sensitive data stays locked in the building; innovation never starts.

I built **NOVA** to break that deadlock.

It's a generative AI system that learns the statistical structure of a real microfinance loan book and produces brand-new, synthetic records — data that's statistically faithful, useful for ML, and traceable to no real person.

What I actually built, from first principles:
→ A **Conditional Tabular GAN (CTGAN)** implemented from scratch in PyTorch — mode-specific normalization, a PacGAN critic, WGAN-GP loss, training-by-sampling. No model libraries.
→ A **structural-causal ground-truth dataset** of 10,000 West African loans with realistic, verified correlations.
→ A **four-metric validation suite** that proves quality instead of claiming it: statistical similarity, correlation preservation, train-on-synthetic-test-on-real (TSTR), and a privacy check via distance-to-closest-record.
→ A **live web app** — Next.js + FastAPI — where you upload a CSV, generate, and download in three clicks.

The results that matter:
• TSTR — a model trained only on synthetic data reaches **92%** of real-data accuracy (94% by AUC).
• Privacy — synthetic rows are no closer to real records than a fresh real sample is (DCR ratio 1.10; ~1% near-duplicates) → no memorisation.
• Statistical fidelity 0.94, and correlation structure preserved at an L1 distance of 0.05.

The hardest — and most valuable — part wasn't the GAN. It was the honesty around it: building data you can trust, measuring what actually matters, and being explicit about every judgement call.

Code is open source. If it helps one builder skip the cold-start data trap, it was worth it. 🔗 in comments.

#SyntheticData #AI #MachineLearning #Africa #Fintech #FinancialInclusion #GenerativeAI #DataScience #PyTorch

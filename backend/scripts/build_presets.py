"""
Define the 7 financial-domain criteria presets, write them to backend/presets/
as JSON, and smoke-test each by generating a sample (validates every spec).

Run (from backend/):  python -m scripts.build_presets
"""

from __future__ import annotations

import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from synthfin.criteria import generate_from_criteria, validate_spec  # noqa: E402

PRESETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "presets")


def C(name, type_, dist=None, **extra):
    col = {"name": name, "type": type_, "dist": dist or {"dist": "derived"}}
    col.update(extra)
    return col


def cat(values, weights=None):
    d = {"dist": "categorical", "values": values}
    if weights:
        d["weights"] = weights
    return d


# --------------------------------------------------------------------------- #
LOANS = {
    "id": "loans", "name": "Banking — Microfinance Loans",
    "description": "Credit/loan records for credit scoring and default-risk modelling.",
    "domain": "Banking", "target": "default",
    "columns": [
        C("borrower_id", "id", {"dist": "uuid"}),
        C("age", "integer", {"dist": "normal", "mu": 35, "sigma": 12}, min=18, max=75),
        C("gender", "categorical", cat(["Male", "Female"], [0.4, 0.6])),
        C("education_level", "categorical", cat(["None", "Primary", "Secondary", "Tertiary"], [0.15, 0.3, 0.35, 0.2])),
        C("employment_type", "categorical", cat(["Salaried", "Self-employed", "Informal", "Unemployed"], [0.2, 0.35, 0.35, 0.1])),
        C("monthly_income_usd", "continuous", {"dist": "gamma", "shape": 3, "scale": 150}, min=40, max=3000),
        C("loan_amount_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 250}, min=50, max=2000),
        C("term_months", "categorical", cat([3, 6, 9, 12, 18, 24], [0.18, 0.28, 0.16, 0.22, 0.1, 0.06])),
        C("interest_rate_apr", "continuous", {"dist": "normal", "mu": 15, "sigma": 3}, min=8, max=30),
        C("has_collateral", "binary", {"dist": "bernoulli", "p": 0.3}),
        C("group_lending", "binary", {"dist": "bernoulli", "p": 0.6}),
        C("previous_defaults", "count", {"dist": "poisson", "lam": 0.3}, min=0, max=5),
        C("credit_score", "integer", {"dist": "normal", "mu": 550, "sigma": 100}, min=300, max=800),
        C("_u", "continuous", {"dist": "uniform", "low": 0, "high": 1}),
        C("_p", "continuous"),
        C("default", "binary"),
    ],
    "rules": [
        {"target": "loan_amount_usd", "expr": "clip(loan_amount_usd*0.6 + monthly_income_usd*1.2, 50, 2000)"},
        {"target": "_p", "expr": "0.25"},
        {"target": "_p", "when": "has_collateral == 1", "expr": "_p - 0.10"},
        {"target": "_p", "when": "group_lending == 1", "expr": "_p - 0.07"},
        {"target": "_p", "when": "previous_defaults > 0", "expr": "_p + 0.22"},
        {"target": "_p", "when": "interest_rate_apr > 18", "expr": "_p + 0.10"},
        {"target": "_p", "when": "monthly_income_usd > 400", "expr": "_p - 0.08"},
        {"target": "_p", "when": "credit_score < 480", "expr": "_p + 0.10"},
        {"target": "_p", "expr": "clip(_p, 0.02, 0.95)"},
        {"target": "default", "expr": "_u < _p"},
    ],
}

TRANSACTIONS = {
    "id": "transactions", "name": "Transactions — Fraud Detection",
    "description": "Payment/transfer records for fraud and AML modelling (~2-5% fraud).",
    "domain": "Payments", "target": "fraud",
    "columns": [
        C("transaction_id", "id", {"dist": "uuid"}),
        C("user_id", "id", {"dist": "uuid"}),
        C("transaction_type", "categorical", cat(["Transfer", "Purchase", "Withdrawal", "Deposit"], [0.3, 0.4, 0.2, 0.1])),
        C("amount_usd", "continuous", {"dist": "gamma", "shape": 1.5, "scale": 120}, min=1, max=20000),
        C("sender_tenure_months", "continuous", {"dist": "gamma", "shape": 2, "scale": 24}, min=0, max=240),
        C("merchant_category", "categorical", cat(["Retail", "Food", "Transport", "Online", "Services"], [0.3, 0.25, 0.15, 0.18, 0.12])),
        C("location_region", "categorical", cat(["Urban", "Rural", "International"], [0.6, 0.3, 0.1])),
        C("device_type", "categorical", cat(["Mobile", "Desktop", "Unknown"], [0.65, 0.3, 0.05])),
        C("transaction_hour", "integer", {"dist": "uniform", "low": 0, "high": 23}, min=0, max=23),
        C("is_weekend", "binary", {"dist": "bernoulli", "p": 0.3}),
        C("flagged_suspicious", "binary", {"dist": "bernoulli", "p": 0.05}),
        C("_u", "continuous", {"dist": "uniform", "low": 0, "high": 1}),
        C("_p", "continuous"),
        C("fraud", "binary"),
    ],
    "rules": [
        {"target": "_p", "expr": "0.02"},
        {"target": "_p", "when": "(amount_usd > 800) and (location_region == 'International')", "expr": "_p + 0.45"},
        {"target": "_p", "when": "(sender_tenure_months < 1) and (amount_usd > 500)", "expr": "_p + 0.28"},
        {"target": "_p", "when": "(is_weekend == 1) and (merchant_category == 'Online') and (amount_usd > 500)", "expr": "_p + 0.18"},
        {"target": "_p", "when": "flagged_suspicious == 1", "expr": "_p + 0.75"},
        {"target": "_p", "expr": "clip(_p, 0.005, 0.98)"},
        {"target": "fraud", "expr": "_u < _p"},
    ],
}

INSURANCE = {
    "id": "insurance", "name": "Insurance — Claims & Actuarial",
    "description": "Policy/claims records for actuarial pricing and risk modelling.",
    "domain": "Insurance", "target": "claim",
    "columns": [
        C("policy_id", "id", {"dist": "uuid"}),
        C("insured_age", "integer", {"dist": "normal", "mu": 45, "sigma": 15}, min=18, max=90),
        C("insured_gender", "categorical", cat(["Male", "Female"], [0.48, 0.52])),
        C("policy_type", "categorical", cat(["Life", "Health", "Auto", "Property"], [0.25, 0.3, 0.25, 0.2])),
        C("policy_term_years", "categorical", cat([1, 2, 3, 5, 10], [0.25, 0.2, 0.2, 0.2, 0.15])),
        C("premium_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 1000}, min=50, max=50000),
        C("sum_assured_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 50000}, min=1000, max=2000000),
        C("smoking_status", "categorical", cat(["Smoker", "Non-smoker", "Former"], [0.18, 0.7, 0.12])),
        C("bmi", "continuous", {"dist": "normal", "mu": 27, "sigma": 5}, min=15, max=50),
        C("occupation_risk", "categorical", cat(["Low", "Medium", "High"], [0.5, 0.35, 0.15])),
        C("region", "categorical", cat(["Urban", "Suburban", "Rural"], [0.5, 0.3, 0.2])),
        C("has_made_previous_claim", "binary", {"dist": "bernoulli", "p": 0.2}),
        C("customer_tenure_years", "continuous", {"dist": "gamma", "shape": 2, "scale": 5}, min=0, max=40),
        C("_u", "continuous", {"dist": "uniform", "low": 0, "high": 1}),
        C("_p", "continuous"),
        C("claim", "binary"),
    ],
    "rules": [
        {"target": "_p", "expr": "0.08"},
        {"target": "_p", "when": "occupation_risk == 'High'", "expr": "_p + 0.17"},
        {"target": "_p", "when": "(policy_type == 'Health') and (smoking_status == 'Smoker')", "expr": "_p + 0.22"},
        {"target": "_p", "when": "has_made_previous_claim == 1", "expr": "_p + 0.30"},
        {"target": "_p", "when": "bmi > 32", "expr": "_p + 0.08"},
        {"target": "_p", "when": "insured_age > 65", "expr": "_p + 0.07"},
        {"target": "_p", "expr": "clip(_p, 0.01, 0.95)"},
        {"target": "claim", "expr": "_u < _p"},
    ],
}

REMITTANCES = {
    "id": "remittances", "name": "Remittances — Cross-border Transfers",
    "description": "Diaspora money-transfer records for economic and corridor analysis.",
    "domain": "Remittances", "target": None,
    "columns": [
        C("transaction_id", "id", {"dist": "uuid"}),
        C("sender_country", "categorical", cat(["US", "UK", "Spain", "France", "Italy", "Canada", "Germany"])),
        C("receiver_country", "categorical", cat(["Gambia", "Senegal", "Nigeria", "Ghana"], [0.3, 0.25, 0.25, 0.2])),
        C("amount_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 250}, min=10, max=5000),
        C("transfer_channel", "categorical", cat(["Bank", "Mobile", "Fintech", "Western Union"], [0.25, 0.3, 0.25, 0.2])),
        C("transfer_purpose", "categorical", cat(["Family Support", "Savings", "Education", "Health", "Business"], [0.45, 0.15, 0.15, 0.1, 0.15])),
        C("transfer_frequency", "count", {"dist": "poisson", "lam": 4}, min=1, max=30),
        C("exchange_rate", "continuous", {"dist": "normal", "mu": 550, "sigma": 50}, min=300, max=900),
        C("sender_gender", "categorical", cat(["Male", "Female"], [0.55, 0.45])),
        C("is_weekend", "binary", {"dist": "bernoulli", "p": 0.28}),
        C("fee_usd", "continuous"),
        C("remittance_growth", "continuous", {"dist": "normal", "mu": 5, "sigma": 2}, min=-5, max=20),
    ],
    "rules": [
        {"target": "amount_usd", "when": "transfer_purpose == 'Family Support'", "expr": "amount_usd * 0.7"},
        {"target": "amount_usd", "when": "transfer_purpose == 'Business'", "expr": "amount_usd * 1.8"},
        {"target": "amount_usd", "expr": "clip(amount_usd * (1 - 0.02*transfer_frequency), 10, 5000)"},
        {"target": "fee_usd", "expr": "amount_usd * 0.05"},
        {"target": "fee_usd", "when": "transfer_channel == 'Mobile'", "expr": "amount_usd * 0.02"},
        {"target": "fee_usd", "when": "transfer_channel == 'Western Union'", "expr": "amount_usd * 0.08"},
    ],
}

MACRO = {
    "id": "macro", "name": "Macro — Economic Indicators",
    "description": "Quarterly macroeconomic indicators for policy and regulatory analysis.",
    "domain": "Macro", "target": None,
    "columns": [
        C("indicator_id", "id", {"dist": "uuid"}),
        C("country", "categorical", cat(["Gambia", "Senegal", "Nigeria", "Ghana", "Mali", "Guinea"])),
        C("year", "integer", {"dist": "uniform", "low": 2000, "high": 2025}, min=2000, max=2025),
        C("quarter", "integer", {"dist": "uniform", "low": 1, "high": 4}, min=1, max=4),
        C("gdp_growth", "continuous", {"dist": "normal", "mu": 3, "sigma": 2}, min=-8, max=12),
        C("inflation_rate", "continuous", {"dist": "normal", "mu": 8, "sigma": 3}, min=0, max=40),
        C("unemployment_rate", "continuous", {"dist": "normal", "mu": 8, "sigma": 4}, min=0, max=40),
        C("interest_rate", "continuous", {"dist": "normal", "mu": 15, "sigma": 5}, min=1, max=40),
        C("exchange_rate", "continuous", {"dist": "normal", "mu": 500, "sigma": 100}, min=50, max=2000),
        C("government_debt_pct_gdp", "continuous", {"dist": "normal", "mu": 60, "sigma": 20}, min=0, max=200),
        C("tax_revenue_pct_gdp", "continuous", {"dist": "normal", "mu": 12, "sigma": 4}, min=0, max=40),
        C("population_growth", "continuous", {"dist": "normal", "mu": 2.5, "sigma": 0.5}, min=0, max=5),
        C("poverty_rate", "continuous", {"dist": "normal", "mu": 35, "sigma": 10}, min=0, max=90),
    ],
    "rules": [
        {"target": "gdp_growth", "expr": "gdp_growth - (year - 2012) * 0.05"},
        {"target": "interest_rate", "expr": "clip(inflation_rate + 5 + (interest_rate - 15) * 0.3, 1, 40)"},
    ],
}

INVESTMENT = {
    "id": "investment", "name": "Investment — Portfolios & Returns",
    "description": "Portfolio holdings for asset allocation and risk modelling.",
    "domain": "Wealth", "target": "is_underwater",
    "columns": [
        C("portfolio_id", "id", {"dist": "uuid"}),
        C("investor_age", "integer", {"dist": "normal", "mu": 50, "sigma": 15}, min=18, max=90),
        C("investor_risk_profile", "categorical", cat(["Conservative", "Moderate", "Aggressive"], [0.35, 0.4, 0.25])),
        C("asset_class", "categorical", cat(["Equity", "Fixed Income", "Real Estate", "Commodities", "Cash"], [0.4, 0.25, 0.15, 0.1, 0.1])),
        C("market_sector", "categorical", cat(["Tech", "Finance", "Healthcare", "Consumer", "Energy"])),
        C("country_exposure", "categorical", cat(["Developed", "Emerging", "Frontier"], [0.5, 0.35, 0.15])),
        C("investment_amount_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 50000}, min=500, max=5000000),
        C("annual_return_pct", "continuous", {"dist": "normal", "mu": 8, "sigma": 15}, min=-60, max=80),
        C("volatility_pct", "continuous", {"dist": "normal", "mu": 15, "sigma": 8}, min=0, max=60),
        C("dividend_yield_pct", "continuous", {"dist": "normal", "mu": 2, "sigma": 1.5}, min=0, max=10),
        C("risk_rating", "integer", {"dist": "uniform", "low": 1, "high": 5}, min=1, max=5),
        C("current_value_usd", "continuous"),
        C("is_underwater", "binary"),
    ],
    "rules": [
        {"target": "volatility_pct", "when": "investor_risk_profile == 'Aggressive'", "expr": "volatility_pct + 10"},
        {"target": "annual_return_pct", "when": "asset_class == 'Cash'", "expr": "2"},
        {"target": "volatility_pct", "when": "asset_class == 'Cash'", "expr": "1"},
        {"target": "current_value_usd", "expr": "clip(investment_amount_usd * (1 + annual_return_pct/100), 0, 1000000000)"},
        {"target": "is_underwater", "expr": "annual_return_pct < 0"},
    ],
}

CORPORATE = {
    "id": "corporate", "name": "Corporate — Financial Statements",
    "description": "Company financials for credit analysis and valuation.",
    "domain": "Corporate", "target": None,
    "columns": [
        C("company_id", "id", {"dist": "uuid"}),
        C("industry", "categorical", cat(["Agriculture", "Manufacturing", "Retail", "Technology", "Finance", "Services"])),
        C("year", "integer", {"dist": "uniform", "low": 2020, "high": 2025}, min=2020, max=2025),
        C("revenue_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 10000000}, min=10000, max=5000000000),
        C("total_assets_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 15000000}, min=10000, max=8000000000),
        C("total_liabilities_usd", "continuous", {"dist": "gamma", "shape": 2, "scale": 8000000}, min=0, max=6000000000),
        C("current_ratio", "continuous", {"dist": "normal", "mu": 1.8, "sigma": 0.6}, min=0.1, max=6),
        C("roe_pct", "continuous", {"dist": "normal", "mu": 12, "sigma": 5}, min=-30, max=60),
        C("gross_margin_pct", "continuous", {"dist": "normal", "mu": 35, "sigma": 10}, min=0, max=90),
        C("operating_margin_pct", "continuous", {"dist": "normal", "mu": 10, "sigma": 5}, min=-20, max=50),
        C("employees_count", "integer", {"dist": "gamma", "shape": 2, "scale": 100}, min=1, max=100000),
        C("auditor", "categorical", cat(["Big 4", "Regional", "Local"], [0.3, 0.4, 0.3])),
        C("net_income_usd", "continuous"),
        C("equity_usd", "continuous"),
        C("debt_to_equity_ratio", "continuous"),
        C("financial_health_score", "continuous"),
    ],
    "rules": [
        {"target": "net_income_usd", "expr": "revenue_usd * (operating_margin_pct / 100)"},
        {"target": "equity_usd", "expr": "total_assets_usd - total_liabilities_usd"},
        {"target": "debt_to_equity_ratio", "expr": "clip(total_liabilities_usd / clip(equity_usd, 1.0, 100000000000), 0, 20)"},
        {"target": "financial_health_score", "expr": "clip(60 + roe_pct - debt_to_equity_ratio*4 + (current_ratio - 1.8)*6, 0, 100)"},
    ],
}

ALL = [LOANS, TRANSACTIONS, INSURANCE, REMITTANCES, MACRO, INVESTMENT, CORPORATE]


def main() -> int:
    os.makedirs(PRESETS_DIR, exist_ok=True)
    ok = True
    print(f"Writing {len(ALL)} presets to {PRESETS_DIR}\n")
    for spec in ALL:
        problems = validate_spec(spec)
        if problems:
            ok = False
            print(f"  FAIL  {spec['id']}: {problems}")
            continue
        path = os.path.join(PRESETS_DIR, f"{spec['id']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(spec, f, indent=2)
        try:
            df, rep = generate_from_criteria(spec, n_rows=2000, seed=1)
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"  FAIL  {spec['id']}: generation error: {e}")
            continue
        tgt = spec.get("target")
        rate = f"{spec['target']}={df[tgt].mean():.3f}" if tgt and tgt in df else "no target"
        leak = [c for c in df.columns if c.startswith("_")]
        print(f"  PASS  {spec['id']:<13} {df.shape[1]:>2} cols  missing={rep['missing_values']}  "
              f"{rate}{'  LEAK:'+str(leak) if leak else ''}")

    print("\n" + ("ALL PRESETS OK" if ok else "SOME PRESETS FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

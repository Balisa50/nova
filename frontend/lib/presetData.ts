// AUTO-GENERATED from backend/presets/*.json. Bundled into the app so the
// studio renders instantly without waiting on the backend; only data
// generation calls the API. Regenerate if the presets change.
import type { CriteriaSpec } from "@/lib/api";

export const BUNDLED_PRESETS: CriteriaSpec[] = [
{
  "id": "loans",
  "name": "Loans: Credit Scoring",
  "description": "Generate loan applications with believable default patterns, for credit scoring and risk models.",
  "domain": "Banking",
  "target": "default",
  "highlights": [
    "Starting default rate: 25%",
    "Collateral lowers default risk",
    "Group lending lowers default risk",
    "A history of defaults raises risk sharply",
    "Higher interest rates and lower income raise risk"
  ],
  "columns": [
    {
      "name": "borrower_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "age",
      "type": "integer",
      "dist": {
        "dist": "normal",
        "mu": 35,
        "sigma": 12
      },
      "min": 18,
      "max": 75
    },
    {
      "name": "gender",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Male",
          "Female"
        ],
        "weights": [
          0.4,
          0.6
        ]
      }
    },
    {
      "name": "education_level",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "None",
          "Primary",
          "Secondary",
          "Tertiary"
        ],
        "weights": [
          0.15,
          0.3,
          0.35,
          0.2
        ]
      }
    },
    {
      "name": "employment_type",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Salaried",
          "Self-employed",
          "Informal",
          "Unemployed"
        ],
        "weights": [
          0.2,
          0.35,
          0.35,
          0.1
        ]
      }
    },
    {
      "name": "monthly_income_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 3,
        "scale": 150
      },
      "min": 40,
      "max": 3000
    },
    {
      "name": "loan_amount_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 250
      },
      "min": 50,
      "max": 2000
    },
    {
      "name": "term_months",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          3,
          6,
          9,
          12,
          18,
          24
        ],
        "weights": [
          0.18,
          0.28,
          0.16,
          0.22,
          0.1,
          0.06
        ]
      }
    },
    {
      "name": "interest_rate_apr",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 15,
        "sigma": 3
      },
      "min": 8,
      "max": 30
    },
    {
      "name": "has_collateral",
      "type": "binary",
      "dist": {
        "dist": "bernoulli",
        "p": 0.3
      }
    },
    {
      "name": "group_lending",
      "type": "binary",
      "dist": {
        "dist": "bernoulli",
        "p": 0.6
      }
    },
    {
      "name": "previous_defaults",
      "type": "count",
      "dist": {
        "dist": "poisson",
        "lam": 0.3
      },
      "min": 0,
      "max": 5
    },
    {
      "name": "credit_score",
      "type": "integer",
      "dist": {
        "dist": "normal",
        "mu": 550,
        "sigma": 100
      },
      "min": 300,
      "max": 800
    },
    {
      "name": "_u",
      "type": "continuous",
      "dist": {
        "dist": "uniform",
        "low": 0,
        "high": 1
      }
    },
    {
      "name": "_p",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "default",
      "type": "binary",
      "dist": {
        "dist": "derived"
      }
    }
  ],
  "rules": [
    {
      "target": "loan_amount_usd",
      "expr": "clip(loan_amount_usd*0.6 + monthly_income_usd*1.2, 50, 2000)"
    },
    {
      "target": "_p",
      "expr": "0.25"
    },
    {
      "target": "_p",
      "when": "has_collateral == 1",
      "expr": "_p - 0.10"
    },
    {
      "target": "_p",
      "when": "group_lending == 1",
      "expr": "_p - 0.07"
    },
    {
      "target": "_p",
      "when": "previous_defaults > 0",
      "expr": "_p + 0.22"
    },
    {
      "target": "_p",
      "when": "interest_rate_apr > 18",
      "expr": "_p + 0.10"
    },
    {
      "target": "_p",
      "when": "monthly_income_usd > 400",
      "expr": "_p - 0.08"
    },
    {
      "target": "_p",
      "when": "credit_score < 480",
      "expr": "_p + 0.10"
    },
    {
      "target": "_p",
      "expr": "clip(_p, 0.02, 0.95)"
    },
    {
      "target": "default",
      "expr": "_u < _p"
    }
  ]
},
{
  "id": "transactions",
  "name": "Transactions: Fraud Detection",
  "description": "Generate payment data to train fraud-detection models, with realistic suspicious activity.",
  "domain": "Payments",
  "target": "fraud",
  "highlights": [
    "Base fraud rate: 2%",
    "International payments over $800 -> much higher risk",
    "Brand-new accounts making large transfers -> higher risk",
    "Weekend online purchases over $500 -> higher risk",
    "Anything already flagged suspicious -> very high risk"
  ],
  "columns": [
    {
      "name": "transaction_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "user_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "transaction_type",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Transfer",
          "Purchase",
          "Withdrawal",
          "Deposit"
        ],
        "weights": [
          0.3,
          0.4,
          0.2,
          0.1
        ]
      }
    },
    {
      "name": "amount_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 1.5,
        "scale": 120
      },
      "min": 1,
      "max": 20000
    },
    {
      "name": "sender_tenure_months",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 24
      },
      "min": 0,
      "max": 240
    },
    {
      "name": "merchant_category",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Retail",
          "Food",
          "Transport",
          "Online",
          "Services"
        ],
        "weights": [
          0.3,
          0.25,
          0.15,
          0.18,
          0.12
        ]
      }
    },
    {
      "name": "location_region",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Urban",
          "Rural",
          "International"
        ],
        "weights": [
          0.6,
          0.3,
          0.1
        ]
      }
    },
    {
      "name": "device_type",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Mobile",
          "Desktop",
          "Unknown"
        ],
        "weights": [
          0.65,
          0.3,
          0.05
        ]
      }
    },
    {
      "name": "transaction_hour",
      "type": "integer",
      "dist": {
        "dist": "uniform",
        "low": 0,
        "high": 23
      },
      "min": 0,
      "max": 23
    },
    {
      "name": "is_weekend",
      "type": "binary",
      "dist": {
        "dist": "bernoulli",
        "p": 0.3
      }
    },
    {
      "name": "flagged_suspicious",
      "type": "binary",
      "dist": {
        "dist": "bernoulli",
        "p": 0.05
      }
    },
    {
      "name": "_u",
      "type": "continuous",
      "dist": {
        "dist": "uniform",
        "low": 0,
        "high": 1
      }
    },
    {
      "name": "_p",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "fraud",
      "type": "binary",
      "dist": {
        "dist": "derived"
      }
    }
  ],
  "rules": [
    {
      "target": "_p",
      "expr": "0.02"
    },
    {
      "target": "_p",
      "when": "(amount_usd > 800) and (location_region == 'International')",
      "expr": "_p + 0.45"
    },
    {
      "target": "_p",
      "when": "(sender_tenure_months < 1) and (amount_usd > 500)",
      "expr": "_p + 0.28"
    },
    {
      "target": "_p",
      "when": "(is_weekend == 1) and (merchant_category == 'Online') and (amount_usd > 500)",
      "expr": "_p + 0.18"
    },
    {
      "target": "_p",
      "when": "flagged_suspicious == 1",
      "expr": "_p + 0.75"
    },
    {
      "target": "_p",
      "expr": "clip(_p, 0.005, 0.98)"
    },
    {
      "target": "fraud",
      "expr": "_u < _p"
    }
  ]
},
{
  "id": "insurance",
  "name": "Insurance: Actuarial Modeling",
  "description": "Generate policy and claims data for pricing and risk analysis.",
  "domain": "Insurance",
  "target": "claim",
  "highlights": [
    "Base claim rate: 8%",
    "High-risk occupations claim more",
    "Smokers on health policies claim more",
    "A previous claim strongly predicts the next",
    "Higher BMI and older age raise claim rates"
  ],
  "columns": [
    {
      "name": "policy_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "insured_age",
      "type": "integer",
      "dist": {
        "dist": "normal",
        "mu": 45,
        "sigma": 15
      },
      "min": 18,
      "max": 90
    },
    {
      "name": "insured_gender",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Male",
          "Female"
        ],
        "weights": [
          0.48,
          0.52
        ]
      }
    },
    {
      "name": "policy_type",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Life",
          "Health",
          "Auto",
          "Property"
        ],
        "weights": [
          0.25,
          0.3,
          0.25,
          0.2
        ]
      }
    },
    {
      "name": "policy_term_years",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          1,
          2,
          3,
          5,
          10
        ],
        "weights": [
          0.25,
          0.2,
          0.2,
          0.2,
          0.15
        ]
      }
    },
    {
      "name": "premium_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 1000
      },
      "min": 50,
      "max": 50000
    },
    {
      "name": "sum_assured_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 50000
      },
      "min": 1000,
      "max": 2000000
    },
    {
      "name": "smoking_status",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Smoker",
          "Non-smoker",
          "Former"
        ],
        "weights": [
          0.18,
          0.7,
          0.12
        ]
      }
    },
    {
      "name": "bmi",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 27,
        "sigma": 5
      },
      "min": 15,
      "max": 50
    },
    {
      "name": "occupation_risk",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Low",
          "Medium",
          "High"
        ],
        "weights": [
          0.5,
          0.35,
          0.15
        ]
      }
    },
    {
      "name": "region",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Urban",
          "Suburban",
          "Rural"
        ],
        "weights": [
          0.5,
          0.3,
          0.2
        ]
      }
    },
    {
      "name": "has_made_previous_claim",
      "type": "binary",
      "dist": {
        "dist": "bernoulli",
        "p": 0.2
      }
    },
    {
      "name": "customer_tenure_years",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 5
      },
      "min": 0,
      "max": 40
    },
    {
      "name": "_u",
      "type": "continuous",
      "dist": {
        "dist": "uniform",
        "low": 0,
        "high": 1
      }
    },
    {
      "name": "_p",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "claim",
      "type": "binary",
      "dist": {
        "dist": "derived"
      }
    }
  ],
  "rules": [
    {
      "target": "_p",
      "expr": "0.08"
    },
    {
      "target": "_p",
      "when": "occupation_risk == 'High'",
      "expr": "_p + 0.17"
    },
    {
      "target": "_p",
      "when": "(policy_type == 'Health') and (smoking_status == 'Smoker')",
      "expr": "_p + 0.22"
    },
    {
      "target": "_p",
      "when": "has_made_previous_claim == 1",
      "expr": "_p + 0.30"
    },
    {
      "target": "_p",
      "when": "bmi > 32",
      "expr": "_p + 0.08"
    },
    {
      "target": "_p",
      "when": "insured_age > 65",
      "expr": "_p + 0.07"
    },
    {
      "target": "_p",
      "expr": "clip(_p, 0.01, 0.95)"
    },
    {
      "target": "claim",
      "expr": "_u < _p"
    }
  ]
},
{
  "id": "remittances",
  "name": "Remittances: Economic Analysis",
  "description": "Generate cross-border transfer data for economic and corridor research.",
  "domain": "Remittances",
  "target": null,
  "highlights": [
    "Family-support transfers are smaller and frequent",
    "Business transfers are larger and rarer",
    "Frequent senders send smaller amounts",
    "Mobile is the cheapest channel; Western Union the priciest"
  ],
  "columns": [
    {
      "name": "transaction_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "sender_country",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "US",
          "UK",
          "Spain",
          "France",
          "Italy",
          "Canada",
          "Germany"
        ]
      }
    },
    {
      "name": "receiver_country",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Gambia",
          "Senegal",
          "Nigeria",
          "Ghana"
        ],
        "weights": [
          0.3,
          0.25,
          0.25,
          0.2
        ]
      }
    },
    {
      "name": "amount_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 250
      },
      "min": 10,
      "max": 5000
    },
    {
      "name": "transfer_channel",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Bank",
          "Mobile",
          "Fintech",
          "Western Union"
        ],
        "weights": [
          0.25,
          0.3,
          0.25,
          0.2
        ]
      }
    },
    {
      "name": "transfer_purpose",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Family Support",
          "Savings",
          "Education",
          "Health",
          "Business"
        ],
        "weights": [
          0.45,
          0.15,
          0.15,
          0.1,
          0.15
        ]
      }
    },
    {
      "name": "transfer_frequency",
      "type": "count",
      "dist": {
        "dist": "poisson",
        "lam": 4
      },
      "min": 1,
      "max": 30
    },
    {
      "name": "exchange_rate",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 550,
        "sigma": 50
      },
      "min": 300,
      "max": 900
    },
    {
      "name": "sender_gender",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Male",
          "Female"
        ],
        "weights": [
          0.55,
          0.45
        ]
      }
    },
    {
      "name": "is_weekend",
      "type": "binary",
      "dist": {
        "dist": "bernoulli",
        "p": 0.28
      }
    },
    {
      "name": "fee_usd",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "remittance_growth",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 5,
        "sigma": 2
      },
      "min": -5,
      "max": 20
    }
  ],
  "rules": [
    {
      "target": "amount_usd",
      "when": "transfer_purpose == 'Family Support'",
      "expr": "amount_usd * 0.7"
    },
    {
      "target": "amount_usd",
      "when": "transfer_purpose == 'Business'",
      "expr": "amount_usd * 1.8"
    },
    {
      "target": "amount_usd",
      "expr": "clip(amount_usd * (1 - 0.02*transfer_frequency), 10, 5000)"
    },
    {
      "target": "fee_usd",
      "expr": "amount_usd * 0.05"
    },
    {
      "target": "fee_usd",
      "when": "transfer_channel == 'Mobile'",
      "expr": "amount_usd * 0.02"
    },
    {
      "target": "fee_usd",
      "when": "transfer_channel == 'Western Union'",
      "expr": "amount_usd * 0.08"
    }
  ]
},
{
  "id": "macro",
  "name": "Macro: Economic Indicators",
  "description": "Generate country-level economic indicators for forecasting and policy work.",
  "domain": "Macro",
  "target": null,
  "highlights": [
    "GDP growth drifts down slightly over time",
    "Interest rates track inflation, with a spread",
    "Every indicator stays within realistic country ranges"
  ],
  "columns": [
    {
      "name": "indicator_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "country",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Gambia",
          "Senegal",
          "Nigeria",
          "Ghana",
          "Mali",
          "Guinea"
        ]
      }
    },
    {
      "name": "year",
      "type": "integer",
      "dist": {
        "dist": "uniform",
        "low": 2000,
        "high": 2025
      },
      "min": 2000,
      "max": 2025
    },
    {
      "name": "quarter",
      "type": "integer",
      "dist": {
        "dist": "uniform",
        "low": 1,
        "high": 4
      },
      "min": 1,
      "max": 4
    },
    {
      "name": "gdp_growth",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 3,
        "sigma": 2
      },
      "min": -8,
      "max": 12
    },
    {
      "name": "inflation_rate",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 8,
        "sigma": 3
      },
      "min": 0,
      "max": 40
    },
    {
      "name": "unemployment_rate",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 8,
        "sigma": 4
      },
      "min": 0,
      "max": 40
    },
    {
      "name": "interest_rate",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 15,
        "sigma": 5
      },
      "min": 1,
      "max": 40
    },
    {
      "name": "exchange_rate",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 500,
        "sigma": 100
      },
      "min": 50,
      "max": 2000
    },
    {
      "name": "government_debt_pct_gdp",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 60,
        "sigma": 20
      },
      "min": 0,
      "max": 200
    },
    {
      "name": "tax_revenue_pct_gdp",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 12,
        "sigma": 4
      },
      "min": 0,
      "max": 40
    },
    {
      "name": "population_growth",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 2.5,
        "sigma": 0.5
      },
      "min": 0,
      "max": 5
    },
    {
      "name": "poverty_rate",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 35,
        "sigma": 10
      },
      "min": 0,
      "max": 90
    }
  ],
  "rules": [
    {
      "target": "gdp_growth",
      "expr": "gdp_growth - (year - 2012) * 0.05"
    },
    {
      "target": "interest_rate",
      "expr": "clip(inflation_rate + 5 + (interest_rate - 15) * 0.3, 1, 40)"
    }
  ]
},
{
  "id": "investment",
  "name": "Investment: Portfolio Modeling",
  "description": "Generate portfolio holdings and returns for asset allocation and risk modelling.",
  "domain": "Wealth",
  "target": "is_underwater",
  "highlights": [
    "Aggressive investors carry more volatility",
    "Cash holdings barely move and return little",
    "A portfolio is 'underwater' when its annual return is negative"
  ],
  "columns": [
    {
      "name": "portfolio_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "investor_age",
      "type": "integer",
      "dist": {
        "dist": "normal",
        "mu": 50,
        "sigma": 15
      },
      "min": 18,
      "max": 90
    },
    {
      "name": "investor_risk_profile",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Conservative",
          "Moderate",
          "Aggressive"
        ],
        "weights": [
          0.35,
          0.4,
          0.25
        ]
      }
    },
    {
      "name": "asset_class",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Equity",
          "Fixed Income",
          "Real Estate",
          "Commodities",
          "Cash"
        ],
        "weights": [
          0.4,
          0.25,
          0.15,
          0.1,
          0.1
        ]
      }
    },
    {
      "name": "market_sector",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Tech",
          "Finance",
          "Healthcare",
          "Consumer",
          "Energy"
        ]
      }
    },
    {
      "name": "country_exposure",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Developed",
          "Emerging",
          "Frontier"
        ],
        "weights": [
          0.5,
          0.35,
          0.15
        ]
      }
    },
    {
      "name": "investment_amount_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 50000
      },
      "min": 500,
      "max": 5000000
    },
    {
      "name": "annual_return_pct",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 8,
        "sigma": 15
      },
      "min": -60,
      "max": 80
    },
    {
      "name": "volatility_pct",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 15,
        "sigma": 8
      },
      "min": 0,
      "max": 60
    },
    {
      "name": "dividend_yield_pct",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 2,
        "sigma": 1.5
      },
      "min": 0,
      "max": 10
    },
    {
      "name": "risk_rating",
      "type": "integer",
      "dist": {
        "dist": "uniform",
        "low": 1,
        "high": 5
      },
      "min": 1,
      "max": 5
    },
    {
      "name": "current_value_usd",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "is_underwater",
      "type": "binary",
      "dist": {
        "dist": "derived"
      }
    }
  ],
  "rules": [
    {
      "target": "volatility_pct",
      "when": "investor_risk_profile == 'Aggressive'",
      "expr": "volatility_pct + 10"
    },
    {
      "target": "annual_return_pct",
      "when": "asset_class == 'Cash'",
      "expr": "2"
    },
    {
      "target": "volatility_pct",
      "when": "asset_class == 'Cash'",
      "expr": "1"
    },
    {
      "target": "current_value_usd",
      "expr": "clip(investment_amount_usd * (1 + annual_return_pct/100), 0, 1000000000)"
    },
    {
      "target": "is_underwater",
      "expr": "annual_return_pct < 0"
    }
  ]
},
{
  "id": "corporate",
  "name": "Corporate: Financial Statements",
  "description": "Generate company financials for credit analysis and valuation.",
  "domain": "Corporate",
  "target": null,
  "highlights": [
    "Net income follows revenue and operating margin",
    "Equity = assets minus liabilities",
    "Debt-to-equity and a health score derive from the statements"
  ],
  "columns": [
    {
      "name": "company_id",
      "type": "id",
      "dist": {
        "dist": "uuid"
      }
    },
    {
      "name": "industry",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Agriculture",
          "Manufacturing",
          "Retail",
          "Technology",
          "Finance",
          "Services"
        ]
      }
    },
    {
      "name": "year",
      "type": "integer",
      "dist": {
        "dist": "uniform",
        "low": 2020,
        "high": 2025
      },
      "min": 2020,
      "max": 2025
    },
    {
      "name": "revenue_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 10000000
      },
      "min": 10000,
      "max": 5000000000
    },
    {
      "name": "total_assets_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 15000000
      },
      "min": 10000,
      "max": 8000000000
    },
    {
      "name": "total_liabilities_usd",
      "type": "continuous",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 8000000
      },
      "min": 0,
      "max": 6000000000
    },
    {
      "name": "current_ratio",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 1.8,
        "sigma": 0.6
      },
      "min": 0.1,
      "max": 6
    },
    {
      "name": "roe_pct",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 12,
        "sigma": 5
      },
      "min": -30,
      "max": 60
    },
    {
      "name": "gross_margin_pct",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 35,
        "sigma": 10
      },
      "min": 0,
      "max": 90
    },
    {
      "name": "operating_margin_pct",
      "type": "continuous",
      "dist": {
        "dist": "normal",
        "mu": 10,
        "sigma": 5
      },
      "min": -20,
      "max": 50
    },
    {
      "name": "employees_count",
      "type": "integer",
      "dist": {
        "dist": "gamma",
        "shape": 2,
        "scale": 100
      },
      "min": 1,
      "max": 100000
    },
    {
      "name": "auditor",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "Big 4",
          "Regional",
          "Local"
        ],
        "weights": [
          0.3,
          0.4,
          0.3
        ]
      }
    },
    {
      "name": "net_income_usd",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "equity_usd",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "debt_to_equity_ratio",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    },
    {
      "name": "financial_health_score",
      "type": "continuous",
      "dist": {
        "dist": "derived"
      }
    }
  ],
  "rules": [
    {
      "target": "net_income_usd",
      "expr": "revenue_usd * (operating_margin_pct / 100)"
    },
    {
      "target": "equity_usd",
      "expr": "total_assets_usd - total_liabilities_usd"
    },
    {
      "target": "debt_to_equity_ratio",
      "expr": "clip(total_liabilities_usd / clip(equity_usd, 1.0, 100000000000), 0, 20)"
    },
    {
      "target": "financial_health_score",
      "expr": "clip(60 + roe_pct - debt_to_equity_ratio*4 + (current_ratio - 1.8)*6, 0, 100)"
    }
  ]
}
] as unknown as CriteriaSpec[];

export const CUSTOM_STARTER: CriteriaSpec = {
  "id": "custom",
  "name": "Your own domain",
  "description": "Define your own columns and rules from scratch.",
  "domain": "Custom",
  "target": "passed",
  "columns": [
    {
      "name": "score",
      "type": "continuous",
      "dist": {
        "dist": "uniform",
        "low": 0,
        "high": 100
      },
      "min": 0,
      "max": 100
    },
    {
      "name": "group",
      "type": "categorical",
      "dist": {
        "dist": "categorical",
        "values": [
          "A",
          "B",
          "C"
        ],
        "weights": [
          0.4,
          0.3,
          0.3
        ]
      }
    },
    {
      "name": "passed",
      "type": "binary",
      "dist": {
        "dist": "derived"
      }
    }
  ],
  "highlights": [
    "Edit the columns and rules to describe any dataset you need."
  ],
  "rules": [
    {
      "target": "score",
      "when": "(group == 'C')",
      "expr": "score - 10"
    },
    {
      "target": "passed",
      "expr": "score >= 50"
    }
  ]
} as unknown as CriteriaSpec;

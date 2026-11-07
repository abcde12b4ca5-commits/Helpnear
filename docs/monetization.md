# Monetization (design only, nothing built)
- Fields reserved: `requests.promoted` (always false in rules), `config.feesEnabled`, `config.promotionFeeUsd`.
- Merchant-of-record fees are roughly 5% + $0.50 per charge (unverified): $3 loses ~22%, $5 ~15%, $10 ~10%. Suggest a minimum of about $5-$10.
- Blocker: the owner has only an Egyptian USD bank account. Provider eligibility (payout to Egypt, product type) must be verified first. No payment code until then.

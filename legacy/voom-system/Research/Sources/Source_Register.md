# Source Register — VOOM Research
Reviewed: 2026-10-23. Prefer primary documentation, official platform references, standards bodies and reproducible data.

## Institutional execution and risk
1. CFA Institute — Trade Strategy and Execution (2026 curriculum; execution objectives, benchmarks, algorithms, transaction-cost analysis): https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/trade-strategy-execution
2. CFA Institute — Measuring and Managing Market Risk: https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/measuring-managing-market-risk
3. CFA Institute — Introduction to Risk Management: https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/introduction-risk-management
4. UK FCA — Multi-firm review of algorithmic trading controls, published 2025-08-21: https://www.fca.org.uk/publications/multi-firm-reviews/algorithmic-trading-controls-high-level-observations
5. UK FCA technical standards — Testing and deployment of trading algorithms: https://handbook.fca.org.uk/technical-standards/s119c1039/s119c1039s369
6. ESMA — Supervisory briefing on algorithmic trading, published 2026-02-26; governance, testing, pre-trade controls, outsourcing and AI considerations: https://www.esma.europa.eu/press-news/esma-news/esma-issues-supervisory-briefing-algorithmic-trading
7. FIA — Best practices for automated trading risk controls and system safeguards: https://www.fia.org/fia/articles/fia-releases-best-practices-automated-trading-risk-controls-and-system-safeguards

## Official development references
8. MQL5 Reference: https://www.mql5.com/en/docs
9. MQL5 Python Integration: https://www.mql5.com/en/docs/python_metatrader5
10. Python Tutorial: https://docs.python.org/3/tutorial/
11. TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
12. React documentation: https://react.dev/learn
13. Next.js documentation: https://nextjs.org/docs
14. Cloudflare Workers documentation: https://developers.cloudflare.com/workers/
15. Supabase documentation: https://supabase.com/docs
16. W3C Web Content Accessibility Guidelines (WCAG) 2.2: https://www.w3.org/TR/WCAG22/
17. MDN Web Docs — accessibility: https://developer.mozilla.org/en-US/docs/Web/Accessibility/

## Retail strategy and community research
18. MQL5 Articles and CodeBase: https://www.mql5.com/en/articles and https://www.mql5.com/en/code
19. Retail trading communities, blogs and videos are idea sources only. Treat as C-grade evidence unless they provide complete rules, realistic costs, sample size, out-of-sample data and reproducible results.

## Source evaluation template
- Source, author, publication date:
- Primary or secondary:
- Claim being evaluated:
- Data and sample size:
- Assumptions/conflicts of interest:
- Reproducibility:
- What would falsify the claim:
- VOOM test ID and result:


## Additional MQL5 learning sources (2026-10-23)

- MQL5 Python integration reference — official API overview for terminal connection, market data, account/symbol information, order checks, trading and history: https://www.mql5.com/en/docs/python_metatrader5
- MQL5 machine-learning article collection — introductory and advanced ML implementation examples; evaluate article claims independently: https://www.mql5.com/en/articles/machine_learning
- MQL5 Strategy Tester articles — testing workflow and execution-related diagnostics: https://www.mql5.com/en/articles/strategy_tester
- Unified Validation Pipeline Against Backtest Overfitting (13 Mar 2026) — discusses temporal partitions and the danger of repeatedly using an out-of-sample set for decisions: https://www.mql5.com/en/articles/21603
- Walk-Forward Efficiency Ratio (9 Jul 2026) — an example metric for comparing out-of-sample performance to in-sample optimization: https://www.mql5.com/en/articles/23250
- Risk Management integration into an EA (17 Feb 2026) — example of adding risk management to an EA and testing it: https://www.mql5.com/en/articles/17640
- Reinforcement Learning gold pipeline (4 Sep 2026) — useful for baseline-first and validation workflow; not proof of profitable RL trading: https://www.mql5.com/en/articles/21314
- Hyperparameter selection audit (8 Oct 2026) — selection optimism and stability in ML parameter search: https://www.mql5.com/en/articles/24238
- Python pytest documentation: https://docs.pytest.org/
- TypeScript handbook: https://www.typescriptlang.org/docs/
- Cloudflare Workers documentation: https://developers.cloudflare.com/workers/
- WCAG 2.2 accessibility standard: https://www.w3.org/TR/WCAG22/

Source-quality note: MQL5 community articles are useful implementation references, but are not all independently peer-reviewed. Treat trading-performance claims as hypotheses until reproduced with costs, out-of-sample data and demo-forward results.

## LLM engineering and safety references (2026-10-23)

20. Hugging Face Transformers — fine-tuning pretrained models: https://huggingface.co/docs/transformers/training
   - Use for SFT pipeline design; fine-tuning starts from pretrained weights and is not training a foundation model from scratch.
21. Hugging Face Transformers — causal language modeling: https://huggingface.co/docs/transformers/tasks/language_modeling
   - Use for next-token language-model concepts and model-training workflow.
22. PyTorch — saving and loading model state: https://docs.pytorch.org/tutorials/beginner/basics/saveloadrun_tutorial.html
   - Keep model artifacts versioned and load weights safely; evaluate checkpoints before use.
23. OWASP GenAI/LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
   - Threat-model prompt injection, sensitive-data disclosure, data poisoning, insecure tool design and excessive agency.
24. OWASP prompt-injection prevention guidance: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
   - Treat retrieved web pages and documents as untrusted data; validate tool output and enforce permissions outside the model.

Source policy: official docs and security standards define implementation controls. Community tutorials are ideas only. Training use still requires source/license review, privacy screening, factual validation, dataset deduplication and held-out evaluation.

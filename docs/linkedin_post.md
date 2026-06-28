# LinkedIn post

---

I read that synthetic data generation is one of the hottest skills in data science right now.

I also needed a project for my portfolio. Something AI, something that actually worked, something I could show.

But I couldn't get real data from home. The Gambia doesn't have open datasets for finance, education, or health, at least not the kind you'd need for a serious project. So I started making data myself. Writing scripts, hard-coding rules, tweaking distributions by hand. It worked, but it was exhausting. Every new dataset meant rewriting everything from scratch, and I was spending more time generating data than building anything with it.

So I built a tool that does it for me. It's called NOVA, and it has two modes.

Mode 1 - Copy. You upload a CSV. NOVA learns the patterns (distributions, correlations, the way the columns actually move together) and generates more of the same. Under the hood it's a Conditional Tabular GAN, written from scratch in PyTorch. No model libraries, just the paper and the code.

Mode 2 - Create. You define the columns, the rules, and the distributions, and NOVA generates data from that knowledge alone. No dataset required. I used this to generate 50,000 WASSCE student records for The Gambia from GBoS, UNESCO, and WAEC statistics. It took about ten seconds.

I validated the copy mode on real West African loan data, the only set I could get my hands on. Four checks:

• Statistical similarity: 0.94
• Correlation preservation: L1 difference of 0.05
• Train on synthetic, test on real: 92% of real-data performance
• Privacy: distance-to-closest-record ratio of 1.10, with only 1.1% near-duplicates

All four passed.

The app is live and open source: https://nova-fin.vercel.app

It's not perfect. The backend goes to sleep after five minutes, so the first request is slow. The UI could be cleaner. But it works, and I learned more building the GAN from scratch than I ever would have from importing one.

If you've ever stared at an empty dataset and wished you had something to work with, this is for you.

Try it. Break it. Tell me what's wrong.

#SyntheticData #DataScience #MachineLearning #PyTorch #Africa

# Bitcoin from zero: a starter bootcamp for Blusat

Ready-to-paste content for the first Blusat bootcamp. Publish it from the
Blusat account through **Learn → Teach on Blusat**.

- **Title:** Bitcoin from zero
- **Topics:** Bitcoin, Lightning
- **"Who is it for, and what will they build?"** No jargon, no trading tips. Learn what makes Bitcoin different from the money you use today, how to hold it yourself, how to send and receive sats over Lightning, and how to spot the scams that target newcomers. Pass the quiz after each lesson to earn the Bitcoin from zero badge.

Add each lesson on the bootcamp page: paste the lesson title, then everything under **Body** into the content box (Markdown works). Then open the lesson and add its quiz.

Each lesson has a quiz. Pass mark: **2 of 3**. The answer marked ✅ is the
right one; the line under it is the explanation learners see afterwards.

---

## Lesson 1: Money, and why Bitcoin is different

### Body

Money does three jobs. It lets you **pay** for things, it lets you **save** for later, and it lets you **compare** prices. Most of us use money issued by a government and held by a bank, and for many people it does those jobs badly:

- **Saving is hard when prices keep rising.** If more money is printed, each unit buys less over time.
- **Access depends on someone else.** You need an account, papers and permission. Banks can freeze accounts or close them.
- **Sending money abroad is slow and expensive.** Fees and exchange rates take a big share of small transfers.

**Bitcoin is money that no company or government controls.** It runs on thousands of computers around the world that all keep the same record of who owns what. Anyone can join, and nobody can change the rules alone.

A few things make it unusual:

- **There will only ever be 21 million bitcoin.** No one can print more. New bitcoin is released on a fixed schedule that halves roughly every four years.
- **It's divisible.** One bitcoin is 100,000,000 **sats** (satoshis). You don't need a whole bitcoin; most everyday payments are a few hundred or a few thousand sats.
- **It's open to everyone.** All you need is a phone and an internet connection. No bank account, no permission.
- **It's final.** Once a payment is confirmed, nobody can reverse it. That protects the person who receives it, and it means you must be careful when you send.

Bitcoin's price moves a lot from day to day. It's best understood as a long-term savings technology and a payment network, not a way to get rich quick.

### Quiz

1. **How many bitcoin will ever exist?**
   - 100 million
   - ✅ 21 million
   - There is no limit; more are printed every year
   - *A fixed supply of 21 million is written into Bitcoin's rules, and nobody can change it alone.*

2. **How many sats are in one bitcoin?**
   - 1,000
   - 1,000,000
   - ✅ 100,000,000
   - *One bitcoin is 100 million sats, so you can own and send tiny amounts.*

3. **Who controls Bitcoin?**
   - The government of the country you live in
   - The company that created it
   - ✅ No single person, company or government
   - *Bitcoin runs on thousands of independent computers that follow the same rules.*

---

## Lesson 2: Keys, wallets and holding your own bitcoin

### Body

A Bitcoin **wallet** doesn't actually hold coins. It holds **keys**: secret codes that prove you're allowed to spend the bitcoin recorded in your name. Whoever has the keys controls the money. That's why Bitcoiners say: **"Not your keys, not your coins."**

There are two ways to hold bitcoin:

- **Custodial:** an exchange or app holds the keys for you. It's easy, but you're trusting them. If they get hacked, go bust or freeze your account, your bitcoin can be gone.
- **Self-custody:** you hold the keys yourself, in a wallet app on your phone or on a small dedicated device. Nobody can freeze it, but nobody can rescue you either.

When you create a self-custody wallet, it shows you a **recovery phrase** (also called a seed phrase): usually **12 or 24 ordinary words** in a fixed order. Those words *are* your keys. With them you can restore your wallet on any new phone if yours is lost or stolen.

How to protect your recovery phrase:

- **Write it on paper**, in order, and store it somewhere safe and private. Some people keep a second copy in another location.
- **Never type it into a website, a chat, an email or a screenshot.** Never store it in your phone's photos or notes.
- **Never share it with anyone, ever.** No real wallet, exchange or support team will ask for it. Anyone who asks for your recovery phrase is trying to steal from you.

A good path: start with a small amount in a simple self-custody wallet, practise restoring it from your recovery phrase, and only then move larger savings in.

### Quiz

1. **What does a Bitcoin wallet really hold?**
   - The coins themselves
   - ✅ The keys that let you spend your bitcoin
   - A copy of your bank card
   - *Your bitcoin is recorded on the network; the wallet holds the keys that prove it's yours.*

2. **Someone from "wallet support" messages you asking for your 12 words to fix a problem. What do you do?**
   - Send them, since support needs them to help
   - Send only the first six words
   - ✅ Refuse and block them: it's a scam
   - *No genuine support team ever needs your recovery phrase. Anyone asking for it wants to steal your bitcoin.*

3. **Where is the best place to keep your recovery phrase?**
   - In a screenshot on your phone
   - In a note in your email
   - ✅ Written on paper, stored somewhere safe and private
   - *Anything online or on your phone can be hacked or leaked. Paper kept offline is much safer.*

---

## Lesson 3: Your first Lightning payment

### Body

Payments on the main Bitcoin network are very secure but can take ten minutes or more, and fees can be too high for small amounts. **Lightning** is a network built on top of Bitcoin for **fast, cheap, everyday payments**. A Lightning payment usually arrives in a couple of seconds and costs a tiny fraction of a sat to a few sats.

There are three common ways to get paid on Lightning:

- **An invoice:** a long code starting with `lnbc`, often shown as a QR code. It asks for a specific amount and can only be paid once. It expires after a while.
- **A Lightning address:** looks like an email address, for example `you@blusat.xyz`. People can send you sats any time, for any amount, without asking you for an invoice first. Every Blusat account can claim one.
- **Zaps:** on Nostr apps like Blusat, a zap is a Lightning tip attached to a post or a profile. It's how people say "this was useful" with real value.

To try it:

1. Install a Lightning wallet on your phone.
2. Ask a friend, or someone in a Blusat club, to send you 100 sats, or receive a zap on a post.
3. Send a few sats back, or zap a post you liked.
4. In Blusat, open **Settings → Wallet** to connect your wallet, so zaps go to a wallet you control. Blusat never holds your money.

Start small. Lightning is designed for everyday amounts; long-term savings are usually best kept on the main Bitcoin network in a self-custody wallet.

### Quiz

1. **What is Lightning best for?**
   - Storing your life savings
   - ✅ Fast, cheap, everyday payments
   - Buying shares on the stock market
   - *Lightning is built for quick, low-cost payments on top of Bitcoin.*

2. **What does a Lightning address look like?**
   - A 12-word phrase
   - ✅ Like an email address, for example you@blusat.xyz
   - A bank account number
   - *A Lightning address looks like an email and lets people send you sats any time.*

3. **What is a zap?**
   - A type of virus
   - A fee your bank charges
   - ✅ A Lightning tip sent to a post or a person on Nostr
   - *Zaps let you reward posts and people with real sats in seconds.*

---

## Lesson 4: Spotting scams and staying safe

### Body

Because Bitcoin payments are final, scammers love newcomers. Almost every scam relies on one of a few tricks:

- **"Double your money."** Investment schemes, mining "plans", trading bots or "account managers" promising fixed daily or weekly returns. Real investments never guarantee profits. If returns come from new people joining, it's a Ponzi scheme, and it will collapse.
- **Fake support and impersonation.** Accounts pretending to be a wallet, an exchange or a famous Bitcoiner, offering help or a giveaway. They want your recovery phrase or a "verification payment".
- **Giveaways.** "Send 0.01 BTC and get 0.02 back." Nobody gives away free bitcoin this way. It's always a scam.
- **Romance and friendship scams.** Someone builds trust over weeks, then introduces an "amazing platform" where you'll invest together.
- **Fake apps and links.** Look-alike wallet apps and websites that steal your keys the moment you enter them.

Rules that protect you:

1. **Never share your recovery phrase.** Not with support, not with friends, not with family.
2. **If it promises guaranteed returns, walk away.**
3. **Slow down when someone rushes you.** Pressure ("only today!", "your account will be closed") is a red flag.
4. **Install wallets only from official app stores and official websites,** and double-check the name and developer.
5. **Test with a small amount first** when sending to a new address.
6. **Ask your club.** Before sending money to anything new, ask people you trust in a Blusat club.

If you've been scammed, stop sending money immediately. Anyone who promises to "recover" your lost bitcoin for a fee is usually a second scammer.

### Quiz

1. **A trading group promises 20% profit every week, guaranteed. What is it most likely to be?**
   - A great opportunity before it gets popular
   - A normal bank savings account
   - ✅ A scam
   - *Guaranteed high returns are the classic sign of a Ponzi scheme or fraud.*

2. **Someone says "Send 0.01 BTC and I'll send 0.02 back." What should you do?**
   - Send it quickly before the offer ends
   - Send a smaller amount to test it
   - ✅ Ignore it: giveaways like this are always scams
   - *No one doubles your bitcoin. Anything you send is gone.*

3. **You lost money to a scam, and now someone offers to recover it for a fee. What is this usually?**
   - ✅ A second scam
   - A government recovery service
   - The police
   - *"Recovery" offers that ask for a fee usually come from scammers targeting victims again.*

---

## Starter clubs

Create these from **Clubs → Start a club**:

| Club | Description |
|---|---|
| **Blusat help desk** | Ask anything about using Blusat, wallets, Lightning or Nostr. No question is too basic. |
| **Bitcoin from zero: cohort** | Created automatically when you publish the bootcamp. Learners discuss the lessons here. |
| **Lightning builders** | For people building apps and tools on Lightning and Nostr. Share what you're working on and get feedback. |
| **Bitcoin in your city** *(rename it, e.g. "Bitcoin Lagos")* | Meet Bitcoiners near you, plan meetups and help newcomers get started. |

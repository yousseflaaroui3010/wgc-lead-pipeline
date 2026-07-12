# The Simple Guide — test everything on your computer

No hard words. Follow each step in order. Each step tells you what you
should see. If you don't see it, jump to the "When something breaks" part
at the bottom.

---

## What you built (in one minute)

- A **form** where a property owner types their name, phone, and address.
- A **helper program** (called n8n) that takes what they typed and emails
  it to the right people.
- A **traffic guard** (called nginx) that stands in front and blocks spam
  robots.
- For testing, a **fake mailbox** (called Mailpit) catches all the emails
  so nothing goes to real people.

All of this runs inside **Docker**. Think of Docker as a box on your
computer that runs small pretend-servers, so you don't have to install
anything on Windows itself.

---

## Part 1 — Turn things on

**Step 1.** Open the Windows Start menu, type `Docker Desktop`, open it.
Wait until the whale icon (bottom of its window or in your taskbar tray)
stops moving. That means it's ready. Can take 1–2 minutes.

**Step 2.** Open a terminal in the project. Easiest way: in VS Code, press
`` Ctrl+` `` (the key under Esc).

**Step 3.** Copy-paste this and press Enter:

```
cd wgc-lead-pipeline
npm run check
```

**You should see:** `pass 14`, `fail 0`, and `size gate: PASS`.
That means the form code is healthy.

**Step 4.** Copy-paste this and press Enter:

```
cd infra
docker compose -f docker-compose.dev.yml up -d
```

The first time this downloads a few things, so give it a few minutes.

**You should see:** three lines that end with the word `Started` (or
`Running`) — one for nginx, one for n8n, one for mailpit.

**Step 5.** Open your web browser. Check these three pages all load:

| Page | What it is | What you should see |
|---|---|---|
| http://localhost:8080/analysis | the form | the "Free Rental Analysis" form |
| http://localhost:5678 | the helper program (n8n) | a sign-up screen |
| http://localhost:8025 | the fake mailbox | an empty inbox |

---

## Part 2 — Set up the helper program (one time only, ~10 minutes)

Go to http://localhost:5678.

**Step 1.** It asks you to make an account. Use any email and password —
this account only lives on your computer. Write the password down anyway.
If it asks survey questions, skip them.

**Step 2 — bring in the 4 recipe files.** n8n calls them "workflows".
Do this 4 times, in THIS order:

1. Click the **orange "Create Workflow"** button (or the + at the top).
2. In the top-right, click the **three dots (⋯)** → **Import from File**.
3. Pick the file from `wgc-lead-pipeline\n8n\workflows\` — first
   `wf3-monitors.json`, then `wf2-delivery.json`, then `wf1-intake.json`,
   then `wf0-token.json`.
4. Press **Ctrl+S** to save each one before moving on.

Why this order: the later ones need to point at the earlier ones.

**Step 3 — tell it how to send email.** (It will send to the fake mailbox.)

1. Open the workflow called **WF-2 Delivery Router**.
2. Double-click the box named **"Fallback: email-parse path"**.
3. At the top there's a field called **Credential to connect with** —
   click it → **Create new credential**.
4. Fill in ONLY these: **Host:** `mailpit` · **Port:** `1025` ·
   turn **SSL/TLS OFF**. Leave user and password empty.
5. Name it `WGC SMTP` (there's a rename spot at the top). Save. Close.
6. Now open every OTHER email box and pick `WGC SMTP` from that same
   dropdown (no need to create it again). The email boxes are:
   - WF-2: **"Notify Jon + Ashley + Youssef"**
   - WF-3: **"Error alert"**, **"Quiet-day alert"**, **"Send I1 export"**
7. Ctrl+S on both workflows.

**Step 4 — fix the web addresses.** The form talks to n8n through two
doors. The doors need the right names:

1. Open **WF-0 Token Issuer** → double-click the box **"GET /token"** →
   find the field called **Path** → change it to exactly:
   `dev-hook/token` → close → Ctrl+S.
2. Open **WF-1 Intake and Validate** → double-click **"POST /lead"** →
   change **Path** to exactly: `dev-hook/lead` → close → Ctrl+S.

**Step 5 — connect WF-1 to WF-2.**

1. In **WF-1**, double-click the box **"Dispatch WF-2 (async)"**.
2. There's a dropdown to pick a workflow. Pick **WF-2 Delivery Router**.
3. Close → Ctrl+S.

**Step 6 — connect the alarm.**

1. In **WF-1**: click the **three dots (⋯)** top-right → **Settings** →
   find **Error Workflow** → pick **WF-3 Monitors** → Save.
2. Do the same inside **WF-2**.

**Step 7 — switch everything on.** Each workflow has an
**Inactive/Active** switch at the top. Open all 4 and flip each one to
**Active**. This matters — nothing works while they're off.

Setup done. You never have to do Part 2 again.

---

## Part 3 — Test it like a real person

**Step 1.** Go to http://localhost:8080/analysis

**Step 2.** Wait 3 seconds after the page loads (fast robots get blocked —
you don't want to look like one). Fill in the form. Example:

- First name: `Test` · Last name: `Person`
- Email: `test@example.com` · Phone: `(817) 445-1108`
- Property address: `100 Main St, Fort Worth, TX`
- Tick the agreement checkbox. Click the button.

**You should see:** a "Request received" message.

**Step 3.** Go to the fake mailbox: http://localhost:8025

**You should see 2 new emails:**
1. One to `parse@localhost.test` — the lead written as plain lines
   (in real life this goes into the company's customer system).
2. One to jon/ashley/youssef addresses — the "new lead!" alert.

**Step 4.** Do it once more, but DON'T tick the checkbox. It should still
work, and the email should say `TCPA Consent: false`. (That's on purpose —
the company just can't text people who didn't agree.)

**If both emails show up both times: the whole pipeline works.** 🎉

---

## Part 4 — Test that robots get blocked

**Step 1.** In the terminal (make sure you're in the
`wgc-lead-pipeline` folder — type `cd ..` if you're still in `infra`):

```
sh qa/probes/bot-probes.sh http://localhost:8080/hook
```

This pretends to be 3 different spam robots.

**You should see:** three lines that say `{"ok":true}` — the robots are
being LIED to (they think they got in).

**Step 2.** Check the fake mailbox: **no new emails**. The robots got
nothing. That's a pass.

**Step 3.** Now wait 1 full minute before testing the form again. The
traffic guard only lets each visitor try 6 times a minute, and the robots
just spent most of that.

**Step 4 (double-click test).** On the form page, fill it again and
double-click the submit button really fast. Only ONE pair of emails should
show up in the mailbox — not two.

---

## Part 5 — Test the "ugly page" trick

Someone else's website might have terrible styling that could mess up our
form. We made a test page whose styling actively tries to break it.

**Step 1.** Go to http://localhost:8080/hostile-host.html

**You should see:** the page's own text box looks awful (red dashed
border, yellow). **Our form below it looks totally normal.** If yes — pass.

**Step 2.** Submit the form on this page (wait 3 seconds first, remember).
Scroll down to "Event log".

**You should see:** `PII-free key check: PASS`. That means the tracking
signal we send to marketing tools contains no personal info.

---

## Part 6 — Turning it off and finishing up

When you're done testing:

```
cd infra
docker compose -f docker-compose.dev.yml down
```

If Parts 3, 4, and 5 all passed, the code is ready to move to the main
branch. From the `wgc-lead-pipeline` folder:

```
git checkout main
git merge --no-ff feature/F1-lead-pipeline
```

---

## When something breaks

**"docker: command not found" or "cannot connect":**
Docker Desktop isn't running. Do Part 1, Step 1 again and WAIT for it.

**A localhost page won't load:**
In the terminal run `docker compose -f docker-compose.dev.yml ps`
(from the `infra` folder). All three lines should say `running`.
If one doesn't: `docker compose -f docker-compose.dev.yml restart`.

**Form shows "Something went wrong" when you submit:**
1. Most common: the workflows aren't switched to **Active** (Part 2,
   Step 7), or the Path names have a typo (Part 2, Step 4). Check both.
2. Also: did you submit within 2 seconds of the page loading, more than
   6 times in a minute, or leave the tab open a long time? You looked
   like a robot. Wait a minute, reload the page, try again slowly.

**You see "Request received" but no emails in the mailbox:**
Go to n8n (localhost:5678) → click **Executions** (left side). Find the
red (failed) run and click it. The box that's red is the broken step —
90% of the time it's an email box that doesn't have the `WGC SMTP`
credential picked (Part 2, Step 3.6).

**n8n's Executions list is empty after a submit:**
The form's message never reached n8n — the door names don't match.
Re-do Part 2, Step 4: the Path fields must be spelled exactly
`dev-hook/token` and `dev-hook/lead` — no extra spaces or slashes.

**Import of a workflow file looks weird / boxes have question marks:**
Your n8n version wants slightly different box versions. Take a screenshot,
note which box, and ask Claude in the next session — say "the WF-x import
shows a broken node" and paste the screenshot.

**Totally stuck / want a clean restart:**
```
cd infra
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```
The `-v` wipes n8n's memory — you'll have to redo Part 2, but it fixes
almost everything.

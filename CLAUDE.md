# Max Payout Calculator

A React + TypeScript app that works out what a prop-firm trader has to make,
and over how many trading days, to reach their next payout. It began as a port
of a MyFundedFutures spreadsheet and now carries five firms' rules.

Start with [README.md](README.md): it documents the calculation, the account
registry, the walkthrough and the themes, and it is kept current with the code.

## Adding or updating a prop firm

Use the **`add-prop-firm` skill** (`.claude/skills/add-prop-firm/SKILL.md`). It
is the whole procedure: pulling a firm's palette and fonts off its site, its
logo and icon as SVGs, crawling its help center for account types, sizes and
payout rules, fitting those to the registry (and extending the model where they
do not fit), the tests to add, and the browser checks that catch what the suite
cannot.

Two rules from it are worth repeating here, because getting them wrong is
expensive:

- **Every figure comes from the firm's own pages, fetched fresh in the
  session** — never from memory. These firms change rules often, their help
  centers go stale against their own sales pages, and a wrong number here sends
  someone's account into a breach.
- **The calculation helpers are shared by every firm.** Run `npx vitest run`
  before adding tests, and read each failure: an invariant that breaks is
  usually one that was only ever true for the firms that existed when it was
  written, and it wants scoping to them, not loosening.

## Working on the code

```bash
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
npx vitest run   # the suite
npm run lint
```

Match the surrounding code: comments explain *why* a rule is shaped the way it
is, usually in the firm's own words, and the tests pin firms' published tables
rather than computed numbers.

**Do not run Prettier over this repo.** There is no config, so it applies its
own defaults — double quotes and semicolons, against the codebase's single
quotes and none — and `--check` disagrees with 36 files. Running it on one file
once buried a small change under a 358-line restyle. Format by hand, in the
style of the file you are editing.

# License rationale

StayKit is licensed **AGPL-3.0-or-later**.

## Why AGPL

- StayKit competes economically with hosted SaaS PMS products. A permissive license (MIT/Apache-2.0)
  would let a competitor fork it, run it as closed-source SaaS, and never contribute back — a hostile
  outcome for a community-funded project.
- AGPL-3.0 closes the network-use loophole GPL leaves open: anyone offering StayKit as a network
  service must publish their modifications, keeping the hosted-SaaS field level.
- The cost: some enterprise chains avoid AGPL for internal use out of legal caution. We accept this —
  the target user is the individual homestay owner, not chains.

## Alternatives considered

- **Elastic License 2.0** or **FSL-1.1-Apache-2.0** (non-OSI, SaaS-adjacent). If AGPL ever blocks
  3+ paying enterprise deals, re-issuing under FSL-1.1-Apache-2.0 is the documented fallback;
  existing contributors retain their AGPL rights.

## Contributions

Contributors sign off with the **Developer Certificate of Origin** (`Signed-off-by:` via `git -s`),
not a CLA — keeping the bar low and copyright distributed.

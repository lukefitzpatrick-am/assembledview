# Xero reference — how to tag an invoice

When you raise an invoice in Xero, put the **MBA number** or the **scope id** in **round brackets** in the Reference field.

That is what AssembledView looks for when it links the invoice to a campaign or a scope of work.

## The rule

Type the campaign or scope as usual, then add the identifier in brackets at the end.

**Do this**

`Penfolds - Grange Hero FY2027 (PENFOLD018)`

AssembledView reads `PENFOLD018` and attaches the invoice to that media plan.

**Also fine**

`legalsuper - SEO Retainer (legal_sow001)`

That is a scope of work, not an MBA. Use the scope id in the same way — round brackets, same place.

A scope id without brackets still works if it sits on its own (for example after a `|`), but brackets are the convention. Use them.

## What does not match

`Penfolds - Grange Hero FY2027`

There is no identifier in brackets, so AssembledView cannot tell which campaign this is. The invoice lands in the Xero exceptions queue for someone to assign by hand.

The same happens for a blank Reference, or wording with no MBA and no scope id (`Annual Retainer`, `Meta Direct Campaigns`).

## If both appear

If a reference contains a real MBA number **and** a scope id, the MBA wins.

## What happens when it is missing

- The invoice still syncs from Xero.
- It is **not** attached to a campaign.
- It shows on the Xero exceptions list until finance adds the MBA (or scope id) in Xero and the next sync picks it up, or someone assigns it in AssembledView.

Square or curly brackets (`[PENFOLD018]`, `{PENFOLD018}`) are read the same way as round ones, but **round brackets are the standard**.

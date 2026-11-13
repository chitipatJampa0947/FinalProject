# CS403 final academic review candidate

13 November 2026. This is a **review candidate**, not a signed or institutionally
approved submission. The DOCX and PDF share the same finalized editable source;
the PDF was exported from it with Microsoft Word and visually checked.

Use `CS403_Report_68-2_36_pkl-r6-final-review-v3.docx` and its matching PDF.
The source was the previously verified r5 report, selected using its documented
author-approved revision history, scientific checks and matching artifact hashes.
Earlier reports elsewhere on this branch are preserved historical versions.

The candidate has 64 pages, five chapters, 31 tables, five drawing elements,
17 bibliography entries and four appendices. All scientific/code table cells,
model results, institutional approval-page text, signature lines and date
placeholders are preserved. Security/deployment descriptions now distinguish the
earlier inference-only experiment from the completed security-integrated release.
No model experiment, training or new test-set evaluation was performed.

## Verified research results

| Evaluation | Macro F1 |
|---|---:|
| Original FP32 test reference | 87.5074% |
| Controlled FP32 validation | 88.7861% |
| Selected W8A32 validation | 88.8342% |
| Fixed W8A32 original test | 87.3705% |

Final test accuracy is 87.3569%, macro precision 88.8430%, macro recall 87.3569%.
Human precision is 97.3624%, Human recall 88.3455%; 112/961 Human examples were
classified as AI. These results are for Thai-dominant news, not proof of authorship
or a linguistically annotated code-switching benchmark. The previously inspected
test split is not described as a never-inspected blind holdout.

Approved model SHA256:
`4baa5cb331f6cad7d90492d33c3e9a5bf53a45029ca5a563aaa86f7a46bc84a2`.
The four classes and 400-token BOS/EOS-inclusive contract remain unchanged.
Weights, datasets and private experiment evidence are deliberately not included.

## Author/advisor decisions still required

- Confirm the inherited preliminary numbering: physical page 4 displays (3),
  physical pages 5–16 display (1)–(12), duplicating (3) at physical page 7.
  Main printed pages 1–48 are continuous. No convention was guessed.
- Verify committee/advisor names, academic-year/course-term details, required
  faculty template and publication/submission rules. Obtain actual signatures and
  dates through the university process; existing placeholders remain unfilled.
- Approve Thai/English language and interpretation, citation style/access dates,
  figure presentation and transparent AI-assistance disclosure.
- Optional: widen Table 3.1's inherited first-column Thai header wrap. Its data
  are complete and not clipped. Any adjustment needs another pagination check.
- Historical presentations are not updated final-defense slides; reconcile their
  claims with this report before using them at the final defense.

Former unverified reference 8 was already removed with approval in r5; current
reference 8 is ONNX Runtime. This revision keeps all 17 surviving numbers. RAID
uses its final ACL publication author ordering; several vague links were made
specific. Figure 2.1 remains the original project-method diagram from r5, with
unchanged PNG/SVG masters. No external figure permission or university approval
has been invented.

`SHA256SUMS.txt` identifies the exact report/figure/note files in this directory.
The detailed reproducibility and formatting evidence is retained privately by
the project owner. No raw feedback, credentials, browser profiles, research data,
deployment wrappers or application source are included in this change.

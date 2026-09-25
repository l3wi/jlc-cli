---
'@jlcpcb/core': patch
---

Skip EasyEDA layer 0 graphics during footprint conversion instead of failing. JLC library tooling draws package body outlines (e.g. TFBGA-265 on C114407) on the unassigned layer 0, which aborted installation with "Cannot convert graphics on unsupported layer 0". Layer 0 graphics are now treated like the other internal documentation layers (99/100/101): omitted from output, still bounding the courtyard.

# NOPITAC — Domain Type Tool
Typographic Bounding Box & Inward Partial Outline Engine for Domain Typography.

All source code for this exploration is located in:
`typeface/nopitac helvetica/domain type/`

---

## Typographic Specifications

- **Font**: Helvetica Neue Regular (400)
- **Font Size**: 16px (16pt), interactive slider control
- **Tracking (Letter Spacing)**: **-25** in Illustrator (`-0.025em` / `-0.4px` at 16px)
- **Leading (Line Height)**: **12px** at 16px font size (ratio $12 / 16 = 0.75$)
- **Box Padding**: Fixed at spec **2.5px**
- **Inward Outline Width**: Fixed at spec **1.0px** (when font size is 16px, strictly inside colored box)
- **Canvas Background**: Always solid white (`#ffffff`)
- **Guidelines / Markers**: Clean vector rendering only (no visual grid lines or measurement boxes)

---

## Alignment & Outline Modes

1. **Center Mode**:
   - Text is center-aligned.
   - Outline covers the **bottom edge** and climbs up both the **left and right edges** to **half the length of lowercase 'l'** from the baseline (`baseline - 0.5 * ascenderHeight`).
2. **Left Mode**:
   - Text is left-aligned.
   - Outline covers the **bottom edge** and the entire **right vertical edge** (top to bottom).
3. **Right Mode**:
   - Text is right-aligned.
   - Outline covers the **bottom edge** and the entire **left vertical edge** (top to bottom).

---

## Links to Open the Tool

- **Local Web Server**: **http://localhost:8188**
- **Direct File**: [index.html](file:///Users/liamfarishta/Desktop/desktop/for.the.meantime/Nopitac/typeface/nopitac%20helvetica/domain%20type/index.html)

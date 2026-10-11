# Render probe results (spec §7.3)

Live YouCam run, 2026-10-11 15:32 UTC. Units: 2032 → 2002.
Demo shoppers are **AI-generated people** (YouCam AI Image Generator), not real individuals. `rendered` = the API returned an image; drape quality is judged by eye in the table.

## Garments (Clothes VTO V4, `full_body`)

| Garment | Model | API | Time | Render | Drape (human) |
|---|---|---|---|---|---|
| Rakta Banarasi Silk Saree | demo_bride | rendered | 32s | ![OUT-SAR-RED](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-SAR-RED.jpg) | Pass |
| Sindoor Velvet Bridal Lehenga | demo_bride | rendered | 31s | ![OUT-LEH-MRN](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-LEH-MRN.jpg) | Pass |
| Genda Phool Haldi Sharara Set | demo_bride | rendered | 30s | ![OUT-SHA-YEL](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-SHA-YEL.jpg) | Pass |
| Gulabi Mirror-work Anarkali | demo_bride | rendered | 29s | ![OUT-ANA-PNK](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-ANA-PNK.jpg) | Pass |
| Zumurrud Embroidered Gharara | demo_bride | rendered | 64s | ![OUT-SHR-GRN](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-SHR-GRN.jpg) | Pass |
| Moonlace Ivory Bridal Gown | demo_bride | rendered | 68s | ![OUT-GWN-IVR](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-GWN-IVR.jpg) | Pass |
| Kandyan Osariya, White and Gold | demo_bride | rendered | 66s | ![OUT-OSA-WHT](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-OSA-WHT.jpg) | Pass |
| Raat Ki Rani Sequin Saree | demo_bride | rendered | 75s | ![OUT-SAR-NVY](../fixtures/youcam/probe/render/outfit_demo_bride_OUT-SAR-NVY.jpg) | Pass |
| Shahi Ivory Sherwani | demo_groom | rendered | 98s | ![OUT-SHW-IVR](../fixtures/youcam/probe/render/outfit_demo_groom_OUT-SHW-IVR.jpg) | Pass |
| Maroon Velvet Bandhgala | demo_groom | rendered | 108s | ![OUT-BND-MRN](../fixtures/youcam/probe/render/outfit_demo_groom_OUT-BND-MRN.jpg) | Pass |
| Haldi Mustard Kurta Pyjama | demo_groom | rendered | 109s | ![OUT-KUR-YEL](../fixtures/youcam/probe/render/outfit_demo_groom_OUT-KUR-YEL.jpg) | Pass |
| Classic Black Tuxedo Jacket | demo_groom | rendered | 115s | ![OUT-TUX-BLK](../fixtures/youcam/probe/render/outfit_demo_groom_OUT-TUX-BLK.jpg) | Pass |

## Bride Chain

| Step | Layer | Result | Time | Image |
|---|---|---|---|---|
| 1 | outfit | rendered | 0s | ![outfit](../fixtures/youcam/probe/render/chain_demo_bride_0_outfit.jpg) |
| 2 | necklace | failed | 6s | 4 |
| 3 | earrings | rendered | 10s | ![earrings](../fixtures/youcam/probe/render/chain_demo_bride_2_earrings.jpg) |
| 4 | makeup | rendered | 14s | ![makeup](../fixtures/youcam/probe/render/chain_demo_bride_3_makeup.jpg) |
| 5 | hair | rendered | 9s | ![hair](../fixtures/youcam/probe/render/chain_demo_bride_4_hair.jpg) |

## Groom Chain

| Step | Layer | Result | Time | Image |
|---|---|---|---|---|
| 1 | outfit | rendered | 1s | ![outfit](../fixtures/youcam/probe/render/chain_demo_groom_0_outfit.jpg) |
| 2 | hair | rendered | 9s | ![hair](../fixtures/youcam/probe/render/chain_demo_groom_1_hair.jpg) |

## Verdict (reviewed by eye, Oct 11 2026; owner to confirm)
- **All 12 garments drape convincingly** on the AI demo shoppers, including the saree, the lehenga and the Kandyan osariya. The spec §7.3 fallback ("drop saree/lehenga, make jewellery the hero") is **not needed**. One note: on the red saree, the API invented a light-blue blouse because the product image showed no blouse.
- **Necklace, first attempt:** it failed with engine error `4`, "Neck size should be larger and position should be in the center." The head-and-shoulders crop that works for earrings, makeup and hair is too wide for a necklace. Necklaces now use a narrower crop centred on the neck (2.6 face-widths), which rendered the temple necklace correctly on the live retest (`chain_demo_bride_1_necklace.jpg`).
- **Earrings, makeup (Sindoor Dusk) and hair (Sleek Middle Part / Textured Comma)** rendered on the first try. They used the upper-body crop and were blended back into the full-length photo.
- **Timing:** about 30–115 s for each Clothes VTO call, and 6–15 s for each jewellery, makeup or hair call.

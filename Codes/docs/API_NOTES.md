# YouCam (Perfect Corp) API: verified reference notes

Researched on 2026-10-10. The docs site is version **v1.16**; its changelog was last updated 2026-08-20.

## How this was verified

- **Primary source.** The official docs at https://docs.perfectcorp.com run on Redocly. Each feature's OpenAPI bundle can be downloaded from `https://docs.perfectcorp.com/_bundle/reference/<name>.json?download`. For example, `ai_clothes.json` is at https://docs.perfectcorp.com/_bundle/reference/ai_clothes.json?download. The guide pages can be read as JSON from `https://docs.perfectcorp.com/page-data/develop/<page>/data.json`. Everything marked **Confirmed** below comes from these OpenAPI bundles or guide pages.
- **Live calls.** Two read-only endpoints were called, and both are free:
  1. `GET /s2s/v1.0/client/credit` (the balance endpoint), called once.
  2. `GET /s2s/v2.0/credit/feature-cost` (the price list), called once per page, 6 pages.

  No task was created, no file was uploaded and no units were spent.
- **Third-party code.** A web search for repositories that call `yce-api-01.makeupar.com` found nothing useful. Nothing in this document is based on third-party code.
- **Status markers.** **Confirmed** means it is stated in the official docs or spec, or was observed in a live call. **Unverified** means it is my inference, or the docs are ambiguous or contradict themselves.

---

## 1. Base URL and authentication

| Item | Value | Status | Source |
|---|---|---|---|
| API base URL | `https://yce-api-01.makeupar.com` | Confirmed: it is the `servers[0].url` in every spec, and the live calls succeeded against it | https://docs.perfectcorp.com/develop/api_server |
| Auth header | `Authorization: Bearer <API_KEY>`, with one space after `Bearer` and no `<>` brackets | Confirmed: the live call returned HTTP 200 | https://docs.perfectcorp.com/develop/quick_start_guide, https://docs.perfectcorp.com/develop/debugging_guide |
| Key used | `YouCam_Phd_API_KEY` from `.env`. It is 67 characters long and starts with `sk-Y`. | Confirmed in the live call | |
| `YouCam_Secret_Key` (`MIGf…`, 216 chars) | This is an RSA-1024 public key from the **legacy v1** flow, which encrypted an `id_token` to obtain an `access_token`. The current docs no longer describe that flow. The only traces left are the `BearerAuthentication` "access_token" scheme on `/s2s/v1.0/client/credit` and a code comment in Look VTO: `'Bearer <access_token for v1, API Key for v2>'`. **The secret key is not needed.** The API key works directly, including on the v1.0 credit endpoint. | Confirmed (live) and inferred (legacy purpose) | https://docs.perfectcorp.com/develop/faq, https://docs.perfectcorp.com/reference/unit_system |
| Console (keys, balance, webhooks) | `https://yce.makeupar.com/api-console/en/api-keys/` (also at `yce.perfectcorp.com`) | Confirmed | quick_start_guide, mcp |
| `yce.perfectcorp.com` and `yce.makeupar.com` | These are marketing and console hosts, **not** the API host. | Confirmed | |

Every call that has a body also sends `Content-Type: application/json`.

### Live call that worked (balance)

```
GET https://yce-api-01.makeupar.com/s2s/v1.0/client/credit
Authorization: Bearer $YouCam_Phd_API_KEY
-> HTTP 200
{"status":200,"results":[]}
```

The raw response is saved in `fixtures/youcam/credit_balance.json`.

> **Warning.** `results` is an **empty array**. According to the schema, each entry is a credit lot `{id, type: ApiSubsToken|ApiPaygToken, amount (deprecated), amount_dec, expiry(ms)}`. An empty list most likely means the account currently holds **no units**, so any task would fail with `400 CreditInsufficiency`. Check the console, or add units, before spending. This is **Unverified**: there might be another reason the list is empty.

---

## 2. End-to-end flow (all features)

The flow is Confirmed from https://docs.perfectcorp.com/develop/quick_start_guide and every feature overview.

1. **(Optional) Create the file record.** `POST /s2s/v2.0/file`. This is the **universal** File API, introduced in v1.14 on 2026-07-28 (see the changelog).
   ```json
   {"files":[{"content_type":"image/jpg","file_name":"selfie.jpg","file_size":547541}]}
   ```
   - `content_type`, `file_name` and `file_size` (in bytes) are all **required**.
   - Files can be up to 10 MB for images and 100 MB for videos.
   - The docs examples use the content type `image/jpg`; the skin-analysis example uses `image/png`.

   The response, as documented in the overview examples (Confirmed):
   ```json
   {"status":200,"data":{"files":[{"content_type":"image/jpg","file_name":"…","file_id":"SaGa…Faud",
     "requests":[{"method":"PUT","url":"https://yce-us.s3-accelerate.amazonaws.com/…","headers":{"Content-Length":"547541","Content-Type":"image/jpg"}}]}]}}
   ```
   The OpenAPI schema for this response is malformed: it has `data: null` plus a `$ref`. Trust the example and its `data.files[]` wrapper. Note that `file_id` can contain `/` and `+`; it is **not** URL-safe.
   Fixture: `fixtures/youcam/docs_examples/file_create.json`.
2. **Upload the bytes.** Send a `PUT` to `data.files[0].requests[0].url` with **exactly** the headers returned in `requests[0].headers`, and the raw file as the body (`--data-binary`).
   - If you skip this step, the task later fails with `404` or `500 unknown_internal_error`. Confirmed: https://docs.perfectcorp.com/develop/debugging_guide.
3. **Alternative to steps 1 and 2.** Every task accepts a publicly reachable `src_file_url` and `ref_file_url` (or `ref_file_urls`) instead of file IDs. Confirmed in every spec.
4. **Create the task.** `POST /s2s/<ver>/task/<slug>` returns `{"status":200,"data":{"task_id":"…"}}`.
5. **Poll.** `GET /s2s/<ver>/task/<slug>/{task_id}` returns `{"status":200,"data":{"task_status":"running"|"success"|"error","error":<code|null>,"error_message":<str>,"results":{…}}}`.
   - The specs recommend polling **about every 10 s**.
   - Units are charged **only on `success`**. On `error`, no units are charged.
   - You must keep polling within the retention window, or the task returns `InvalidTaskId`.
6. **Result.** Image features return `data.results.url`, a download link that is **valid for 2 hours**. Polling again later returns a fresh link.

### Webhooks (optional)

Confirmed: https://docs.perfectcorp.com/develop/webhook.

- Webhooks are configured in the console at https://yce.makeupar.com/api-console/en/webhook/, with up to 10 endpoints. They are not set per request.
- The service sends `POST` requests with this body: `{"created_at":<unix s>,"data":{"task_id":"…","task_status":"success"|"error"}}`.
- Each request carries the headers `webhook-id`, `webhook-timestamp` and `webhook-signature: v1,<base64 HMAC-SHA256>`.
- The signed content is `{webhook-id}.{webhook-timestamp}.{raw-minified-body}`.
- The secret is `whsec_<base64>`. Base64-decode the part after the prefix to get the key. This follows the Standard Webhooks spec.

### Retention

| Item | How long it lasts | Status and source |
|---|---|---|
| Uploaded `file_id` | 30 days | Confirmed: https://docs.perfectcorp.com/develop/file_retention_period |
| `task_id` | 30 days according to the retention page | Confirmed (retention page) |
| Result URL | 2 hours | Confirmed |

> **Contradiction.** Every spec's `task_id` field description says "valid to query … for 24 hours", and the skin-analysis overview says results are retained for 24 hours. The retention page says 30 days. **Design for 24 h.**

### Task delete (optional)

`POST /s2s/v2.0/task/delete` with body `{"task_id":"…"}` returns `{"status":200}`. It deletes the task's inputs and outputs. Its error codes are `OperationNotSupport`, `OperationInvalid`, `InvalidTaskId` and `InvalidParameters`. Confirmed: https://docs.perfectcorp.com/reference/task_management.

---

## 3. Errors and rate limits

### HTTP-level errors

These are the response shapes. Confirmed in the per-spec `components.responses`.

| Case | Response |
|---|---|
| 400 on task create | `{"status":400,"error":"…","error_code":"InvalidParameters"|"CreditInsufficiency"|"InvalidStyleGroup"|"InvalidStyle"|"BadRequest"}` |
| 400 on poll | `{"status":400,"error":"Invalid task ID"}`; the makeup and look specs use `"error_code":"InvalidTaskId"` |
| 401 | `{"status":401,"error":"Invalid API key"}`, or `{"status":401,"error_code":"InvalidApiKey"|"InactiveApiKey"|"ExpiredApiKey"}`, or `{"status":401,"error":"Unauthorized","error_code":"InvalidAccessToken"}`. **Handle all three.** |
| 429 | `{"status":429,"error":"Too many requests"}` |
| 500 on poll | `{"status":500,"error":"Task execution timed out"}`, or `error_code: "TaskTimeout"` |

Examples from the skin-analysis docs:

- Mixing HD and SD concerns returns `{"status":400,"error":"cannot mix HD and SD dst_actions","error_code":"InvalidParameters"}`.
- An unknown concern returns `{"status":400,"error":"Not available dst_action abc123","error_code":"InvalidParameters"}`.

### Engine errors

These arrive inside an HTTP 200 poll response as `data.task_status = "error"`, with the code in `data.error`. There is a generic enum plus codes specific to each feature (listed per feature below). Source: https://docs.perfectcorp.com/develop/error_codes.

The generic codes are:

- `exceed_max_filesize`
- `invalid_parameter`
- `error_download_image`, `error_download_mask`
- `error_decode_image`, `error_decode_mask`
- `error_download_video`, `error_decode_video`
- `error_nsfw_content_detected`
- `error_no_face`
- `error_pose`
- `error_face_parsing`
- `error_inference`
- `exceed_nsfw_retry_limits`
- `error_upload`
- `error_multiple_people`
- `error_no_shoulder`
- `error_large_face_angle`
- `error_hair_too_short`
- `error_unexpected_video_duration`
- `error_bald_image`
- `error_unsupport_ratio`
- `unknown_internal_error`
- `error_exceed_max_image_size` (spec enum only)

### Rate limits

Confirmed: https://docs.perfectcorp.com/develop/rate_limit.

- The limit is **250 requests per 300 s per IP**, and separately **250 requests per 300 s per access token**. A request must pass both.
- Going over returns `429`. The docs recommend staying at about 5 QPS or less.
- Polling counts toward these limits.

### JSON precision

Some numeric IDs, such as credit `id` and history `id`, exceed 2^53. Parse them as strings or bigints in JavaScript. Confirmed: https://docs.perfectcorp.com/develop/debugging_guide.

---

## 4. Units: credit balance and feature costs

| Endpoint | Purpose | Status |
|---|---|---|
| `GET /s2s/v1.0/client/credit` | Balance. Returns `{"status":200,"results":[{"id":int,"type":"ApiSubsToken"|"ApiPaygToken","amount":int(deprecated),"amount_dec":number,"expiry":ms}]}`. The balance is the **sum of `amount_dec`**. | Confirmed (spec + live) |
| `GET /s2s/v1.0/client/credit/history?page_size=1..30&starting_token=` | Usage history. Returns `result.history[]` with `{id,timestamp,action,target_id(=task_id),info.credits[{id,amount_dec}],info.dst_actions}` and `result.next_token`. | Confirmed (spec, not called) |
| `GET /s2s/v2.0/credit/feature-cost?page_size=1..20&starting_token=` | Price list. Returns `result.skus[{description,amount,unit:"result_image"|"second",proc_unit,run_task_url}]` and `result.next_token`, which is `null` on the last page. | Confirmed (spec + live: 102 SKUs, saved to `fixtures/youcam/feature_cost.json`) |

The **live feature-cost values** for the features in scope are below. They match the overview tables except where noted.

| Feature | Endpoint | Units per result image |
|---|---|---|
| Clothes V2 / V3 / **V4** | `/s2s/v2.0/task/cloth`, `cloth-v3`, `cloth-v4` | 2 / 2 / **2**. The V4 price appears only in the live list; the overview table stops at V3. |
| Necklace | `/s2s/v2.0/task/2d-vto/necklace` | 1 |
| Earrings | `/s2s/v2.0/task/2d-vto/earring` | 1 for single, 2 for stacked |
| Makeup VTO | `/s2s/v2.0/task/makeup-vto` | 1 |
| Look VTO | `/s2s/v2.0/task/look-vto` | 2 |
| Makeup Transfer | `/s2s/v2.0/task/mu-transfer` | 2 |
| Hairstyle V1.0 (template) | `/s2s/v2.0/task/hair-style` | 1 |
| Hairstyle V2.0 custom | `/s2s/v2.0/task/hair-transfer` | 2 |
| Hairstyle V2.1 (custom or preset) | `/s2s/v2.1/task/hair-transfer` | 2 (both) |
| Skin Analysis V2.0 / V2.1, SD | `/s2s/v2.{0,1}/task/skin-analysis` | 1–4 concerns: 9; 5–8: 12; 9–12: 14; 13–16: 16 |
| Skin Analysis V2.0 / V2.1, HD | same | 1–4 concerns: 12; 5–8: 16; 9–12: 20; 13–16: 22 |
| Skin Simulation | `/s2s/v2.0/task/skin-simulation` | 1–4 concerns: 4; 5–10: 6 |
| Facial Color Tones (skin tone) | `/s2s/v2.0/task/skin-tone-analysis` | **20** |
| Fitzpatrick | `/s2s/v2.0/task/fitzpatrick-scale-analyzer` | 10. The `pre-process` step is not in the price list, so it is probably free (**Unverified**). |
| Face Attributes & Ratio | `/s2s/v2.0/task/face-attr-analysis` | 1–5 features: 10; 6–14: 20; 15–28: 30 |

Template-list endpoints (`GET …/template/…`) are not in the price list, so they are probably free (**Unverified**).

---

## 5. Per-feature reference

For every feature, the create response is `{"status":200,"data":{"task_id":"…"}}`.

Every feature also takes the source image in one of two ways (**required**, exactly one):

- `src_file_id`: from the File API.
- `src_file_url`: a public URL.

Every feature uses the same general input limit unless stated otherwise: **< 10 MB**. Formats are listed per feature.

### 5.1 AI Clothes Virtual Try-On (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_clothes and `_bundle/reference/ai_clothes.json`.

**Slugs**

| Version | Slug | Notes |
|---|---|---|
| **V4.0 (latest)** | `cloth-v4` | Adds `outer` and `filter_multi_person` |
| V3.0 | `cloth-v3` | |
| V2.0 | `cloth` | The only version with template support |

**Endpoints**

- Create: `POST /s2s/v2.0/task/cloth-v4`
- Poll: `GET /s2s/v2.0/task/cloth-v4/{task_id}`
- Templates (V2 only): `GET /s2s/v2.0/task/template/cloth?page_size=1..20&starting_token=` returns `data.templates[{id,thumb,title,category_name}]` and `data.next_token`.

**Body for V4 (V3 is the same minus `outer` and `filter_multi_person`)**

- `src_file_id` or `src_file_url`: **required**.
- `ref_file_id` or `ref_file_url`: **required**. The garment reference can be uploaded as a file **or** passed as a URL.
- `garment_category`: **required**. Enum:
  - V4: `full_body`, `lower_body`, `upper_body`, `shoes`, `auto`, `outer`
  - V2 and V3: the same without `outer`
- `change_shoes`: boolean, default `true`. Only takes effect when the category is `full_body` or `lower_body`.
- `filter_multi_person` (V4 only): `off` (default, uses the largest person), `normal` or `strict`.

**V2 body differences**

- Instead of a reference image, you can pass `template_id` (string) **without** `garment_category`.
- `change_shoes` is also available.

**Poll result:** `data.results.url`, the image. Example fixtures: `docs_examples/clothes_create.json` and `clothes_poll.json`.

**Input limits**

| Image | Constraints |
|---|---|
| User (source) image | 1024×768 recommended, 512×384 minimum, long side ≤ 4096 px, < 10 MB, jpg or png. A single person, filling at least 80% of the frame, shoulders visible, face fully visible, standing and facing forward. |
| Reference: real-person photo | One person. The garment must fully cover the try-on area: for example, a full-body try-on needs a full-body garment image. |
| Reference: product image | A front-facing shot of a single garment, not a composite. A lower-body try-on needs a worn outfit, not a standalone product image. |

**Errors**

- Preprocess: `exceed_max_filesize` (long side > 4096), `error_below_min_image_size` (long side < 128), `error_pose`, `error_invalid_ref`, `error_apply_region_mismatch`, `error_invalid_src`.
- Engine: `invalid_parameter`, `error_download_image`, `error_nsfw_content_detected`, `error_editing_failed` (the result is too similar to the source), `error_multi_person`, `unknown_internal_error`.

**Units:** 2 per result.

### 5.2 AI Necklace Virtual Try-On (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_necklace.

**Endpoints**

- Slug: `2d-vto/necklace`
- Create: `POST /s2s/v2.0/task/2d-vto/necklace`
- Poll: `GET /s2s/v2.0/task/2d-vto/necklace/{task_id}`

**Body.** The necklace image can be a file ID **or** a URL. Note the plural, array-valued reference fields.

- Source: `src_file_id` or `src_file_url`.
- Optional source mask: `srcmsk_file_id` or `srcmsk_file_url`.
- Reference (**required**): `ref_file_ids: [string]` or `ref_file_urls: [string]`.
- `source_info` (**required**): `{ "name": <the same src URL or file_id>, "mask_name"?: <the mask URL or id> }`.
- `object_infos` (**required**): an array of objects, each `{ "name": <ref URL or file_id; must match an entry in ref_file_*>, "parameter"?: {...} }`. The `parameter` fields are:
  - `necklace_need_remove_background`: bool, default `true`
  - `necklace_anchor_point`: `[[x,y],[x,y]]` or `null`
  - `necklace_wearing_location`: `[[x,y],[x,y]]` or `null`
  - `necklace_shadow_intensity`: 0–1
  - `necklace_ambient_light_intensity`: 0–1

> **Contradiction in the defaults.** The schema defaults for shadow and ambient light are 0.5 and 0.5. The overview text says 0.15 and 1.0. **Send both values explicitly.**

**Poll result:** `data.results.url`.

**Input limits**

- Long side ≤ 4096 px, < 10 MB, jpg, jpeg or png.
- The selfie must be front-facing with the neck visible. The neck must be at least 15% of the image width, and head yaw at most 20°.
- The product image must be front-facing, with the background removed.

**Errors:** `RUNTIME_ERROR`, `PHOTO_DETECTION_FAIL`, `OBJECT_DETECTION_FAIL`, `PHOTO_CHECK_INVALID`, `INPUT_ERROR`, `INPUT_MAIN_IMAGE_EMPTY`.

**Units:** 1.

### 5.3 AI Earrings Virtual Try-On (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_earrings.

**Endpoints**

- Slug: `2d-vto/earring`. It is **singular**.
- Create: `POST /s2s/v2.0/task/2d-vto/earring`
- Poll: `GET /s2s/v2.0/task/2d-vto/earring/{task_id}`

**Body**

- The same structure as the necklace, plus optional reference masks: `refmsk_file_ids: [ ]` or `refmsk_file_urls: [ ]`.
- Each `object_infos[]` item can also carry `mask_name`.
- `object_infos[].parameter` fields:
  - `earring_need_remove_background`: bool, default `true`
  - `earring_anchor_point`: `[x,y]` or `null`
  - `earring_wearing_location`: `[x,y]` or `null`
  - `earring_scale`: a number > 0, in cm, or `null`
  - `earring_is_right_ear`: bool, default `true`
  - `earring_occluded_type`: `0` (auto), `1` (occluded) or `2` (none); default `0`
  - `earring_shadow_intensity`: 0–1
  - `earring_ambient_light_intensity`: 0–1

  The same default contradiction applies: the schema says 0.5 and 0.5, the text says 0.15 and 1.0.
- These parameters apply only when the reference shows a single earring. If the reference shows both earrings, everything is auto-detected and the second ear is mirrored.

**Poll result:** `data.results.url`.

**Input limits:** long side ≤ 4096 px, < 10 MB, jpg, jpeg or png. Side-facing selfies work best; frontal selfies are supported.

**Errors:** the same as the necklace.

**Units:** 1 for single, 2 for stacked. How a request counts as "stacked" is not documented; presumably it is more than one `object_infos` entry (**Unverified**).

### 5.4 AI Makeup Virtual Try-On (Confirmed)

Source: https://docs.perfectcorp.com/reference/makeup_vto.

**Endpoints**

- Slug: `makeup-vto`
- Create: `POST /s2s/v2.0/task/makeup-vto`
- Poll: `GET /s2s/v2.0/task/makeup-vto/{task_id}`

**Body**

- `src_file_id` or `src_file_url`
- `version`: `"1.0"` (default)
- `effects[]`: **required**. Each effect has a `category` from this list:
  - `skin_smooth`: `{skinSmoothStrength 0–100 (default 50), skinSmoothColorIntensity 0–100 (default 50)}`. **If you omit this effect, a default smoothing of 50 is applied.**
  - `blush`
  - `bronzer`
  - `concealer`
  - `contour`
  - `eyebrows`: `pattern.type` is `shape` or `color`.
  - `eye_liner`
  - `eye_shadow`
  - `eyelashes`
  - `foundation`
  - `highlighter`
  - `lip_color`: requires `shape.name` and `style.type` (`full`, `ombre` or `twoTone`); `morphology` is optional.
  - `lip_liner`

**Common effect fields**

- Most effects take `pattern.name`, which must be a `label` from the pattern catalogs.
- Each palette entry has `color` (`#RRGGBB`), `colorIntensity` (0–100), `texture` (an enum that depends on the category) and extra fields that depend on the texture.
- The number of `palettes` entries must equal the pattern's `colorNum`.

**Pattern catalogs:** `https://plugins-media.makeupar.com/wcm-saas/patterns/{blush,bronzer,contour,eyebrows,eyeliner,eyeshadow,eyelashes,highlighter,lipliner}.json` and `https://plugins-media.makeupar.com/wcm-saas/shapes/lipshape.json`. Lip shape labels include `original`, `plump` and `pouty`.

**Fixtures:** `docs_examples/makeup_vto_create_request.json`, `makeup_vto_full_payload_request.json`, `makeup_vto_poll.json`, `makeup_vto_poll_engine_error.json` and `task_poll_running.json`.

**Poll result:** `data.results.url`.

> The overview's "Response Body Schema" pseudo-block shows `results[].download_url` and `failure_reason`. **That is wrong.** The actual example and the spec use `results.url`, `error` and `error_message`.

**Input limits:** long side < 1920, face width ≥ 100 px, < 10 MB, jpg, jpeg or png. The error text says width < 1920 and height < 1080. Use a front-facing face within 10° of straight.

**Errors**

- `error_below_min_image_size`
- `error_exceed_max_image_size`
- `error_face_position_invalid`, `error_face_position_too_small`, `error_face_position_out_of_boundary`
- `error_face_angle_invalid`

**Units:** 1.

### 5.5 AI Look Virtual Try-On (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_look_vto.

**Endpoints**

- Slug: `look-vto`
- Templates: `GET /s2s/v2.0/task/template/look-vto?page_size=1..20&starting_token=` returns `data.templates[{id,thumb,title,category_name}]` and `data.next_token`.
- Create: `POST /s2s/v2.0/task/look-vto`
- Poll: `GET /s2s/v2.0/task/look-vto/{task_id}`

**Body:** `template_id` (**required**) plus `src_file_id` or `src_file_url`.

**Poll result:** `data.results.url`.

**Input limits:** the same as Makeup VTO (long side < 1920, face width ≥ 100 px).

**Units:** 2.

### 5.6 AI Makeup Transfer (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_makeup_transfer.

**Endpoints:** `POST /s2s/v2.0/task/mu-transfer` and `GET /s2s/v2.0/task/mu-transfer/{task_id}`.

**Body:** `src_file_id` or `src_file_url`, plus `ref_file_id` or `ref_file_url`. The reference is a face wearing makeup.

**Poll result:** `data.results.url`.

**Input limits:** long side ≤ 1024 px, a single face with the full face visible, < 10 MB, jpg, jpeg or png.

**Errors:** `error_src_no_face`, `error_ref_no_face`, `*_face_too_small`, `*_large_face_angle`, `*_eye_closed`, `*_eye_occluded`, `*_lip_occluded`, `error_inappropriate_ref_case01`, `error_inappropriate_ref_case02`. The `*` stands for `src` or `ref`.

**Units:** 2.

### 5.7 AI Hairstyle (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_hairstyle.

**Recommended version: V2.1**

- Templates: `GET /s2s/v2.1/task/template/hair-transfer?page_size=1..20&starting_token=` returns `data.templates[{id,thumb,title,category_name,keep_users_color}]` and `data.next_token`.
- Create: `POST /s2s/v2.1/task/hair-transfer`
- Poll: `GET /s2s/v2.1/task/hair-transfer/{task_id}`
- Body:
  - `src_file_id` or `src_file_url`
  - exactly one of `template_id`, `ref_file_id` or `ref_file_url`. The reference can be a file or a URL.
  - `hair_color`: `ref` (default) or `src`. It takes effect only in reference-photo mode (changelog v1.16).

**Older versions**

- V1.0 template mode: create with `POST /s2s/v2.0/task/hair-style` (`template_id` is **required**), poll with `GET /s2s/v2.0/task/hair-style/{id}`, list templates with `GET /s2s/v2.0/task/template/hair-style`.
- V2.0 reference mode: create with `POST /s2s/v2.0/task/hair-transfer` (`ref_file_id` or `ref_file_url`), poll with `GET /s2s/v2.0/task/hair-transfer/{id}`.

**Poll result:** `data.results.url`.

**Input limits**

- **jpg or jpeg only**, < 10 MB, long side ≤ 1024 px, face width ≥ 128 px.
- Head pose: pitch within ±10°, yaw within ±45°, roll within ±15°.
- A single face with the full face visible. Shoulders must be visible.

**Errors:** `error_no_shoulder`, `error_large_face_angle`, `error_insufficient_landmarks`, `error_hair_too_short`, `error_face_pose`. The generic `error_bald_image` may also occur.

**Units:** 2 for V2.1. Using V1.0 templates costs 1.

### 5.8 AI Skin Analysis (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_skin_analysis.

**Endpoints**

- Slug: `skin-analysis`
- V2.1 (latest): `POST /s2s/v2.1/task/skin-analysis` and `GET /s2s/v2.1/task/skin-analysis/{task_id}`
- V2.0: the same endpoints with `v2.0`.

**Body**

- `src_file_id` or `src_file_url`.
- `dst_actions: string[]`: **required**. Use all-SD **or** all-HD values; mixing them returns a 400.
  - **HD:** `hd_wrinkle`, `hd_pore`, `hd_texture`, `hd_acne`, `hd_oiliness`, `hd_radiance`, `hd_eye_bag`, `hd_age_spot`, `hd_dark_circle`, `hd_droopy_upper_eyelid`, `hd_droopy_lower_eyelid`, `hd_firmness`, `hd_moisture`, `hd_redness`, `hd_tear_trough`, `hd_skin_type`
  - **SD:** `wrinkle`, `pore`, `texture`, `acne`, `oiliness`, `radiance`, `eye_bag`, `age_spot`, `dark_circle_v2`, `droopy_upper_eyelid`, `droopy_lower_eyelid`, `firmness`, `moisture`, `redness`, `tear_trough`, `skin_type`
- `format`: `"json"` or `"zip"`. **The default is `zip`.** Send `"json"` to get the scores inline.
- `miniserver_args` (optional):
  - `enable_mask_overlay`: bool, default `false`. When `true`, each mask is blended onto the photo and returned as `.jpg`. When `false`, raw `.png` masks are returned.
  - `enable_dark_background_hd_pore` / `enable_dark_background_hd_wrinkle`: bool
  - `color_dark_background_hd_pore` / `color_dark_background_hd_wrinkle`: hex without `#`, for example `"3D3D3D"`
  - `opacity_dark_background_hd_pore` / `opacity_dark_background_hd_wrinkle`: 0–1
- `pf_camera_kit`: bool. V2.1 only, and undocumented.

**Poll result with `format: "json"`.** The result is `data.results.output[]`, a list of entries `{type, region?, raw_score?, ui_score?, score?, skin_type?, mask_urls?[]}`:

- Each region is its own entry. For example, `hd_pore` comes back with `region` set to `whole`, `forehead`, `nose` and `cheek`; `hd_wrinkle` adds `glabellar`, `crowfeet`, `periocular`, `nasolabial` and `marionette`.
- `hd_skin_type` and `skin_type` entries carry a `skin_type` string for each region (`whole`, `t_zone`, `u_zone`), for example `"Combination"`, `"Oily"` or `"Dry & Redness"`.
- Special entries:
  - `{type:"skin_age", score:int}`
  - `{type:"all", score:float}`: the overall score
  - `{type:"resize_image", mask_urls:[…]}`: the resized input, used to align the masks
- `raw_score` is a float from 1 to 100 and `ui_score` is an integer from 1 to 100. Higher means healthier skin.

Fixture: `docs_examples/skin_analysis_poll_json.json`.

**Poll result with `format: "zip"`.** The schema says `data.results.url` points to a ZIP containing `skinanalysisResult/score_info.json` plus PNG masks. The score format is in `docs_examples/skin_analysis_score_info_{hd,sd}.json`.

> **Contradiction.** The spec's zip example shows `data.results` as a **bare string URL**. Handle both shapes.

**Input limits**

| Mode | Short side | Long side | Size and format |
|---|---|---|---|
| SD | ≥ 480 px | No limit; inputs above 2560 are auto-resized to 2560 | < 10 MB, jpg, jpeg or png |
| HD | ≥ 1080 px | Same as SD | Same as SD |

- **The face width must be greater than 60% of the image width.** Otherwise you get `error_src_face_too_small`. This confirms the "rejects small faces" hint.
- Use a frontal pose, even lighting, no glasses if possible, and the forehead visible. A portrait aspect ratio is recommended.

**Errors:** `error_below_min_image_size`, `error_exceed_max_image_size`, `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_lighting_dark`.

**Units:** see §4. The price tiers go up to 16 concerns.

### 5.9 AI Skin Simulation (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_skin_simulation.

**Endpoints:** `POST /s2s/v2.0/task/skin-simulation` and `GET /s2s/v2.0/task/skin-simulation/{task_id}`.

**Body**

- `src_file_id` or `src_file_url`.
- Any of the following, each a number from 0.0 (original) to 1.0 (maximum improvement): `wrinkle`, `radiance`, `oiliness`, `acne`, `eye_bags`, `dark_circle`, `spots`, `pores`, `texture`, `redness`. Note that for `oiliness`, 1.0 *adds* shine.
- At least one value must be non-zero.

**Poll result:** `data.results.url`.

**Input limits:** short side ≥ 480 px, long side ≤ 2560 px, < 10 MB, jpg, jpeg or png. The face width must be at least 60% of the image width.

**Errors:** `error_below_min_image_size`, `error_exceed_max_image_size`, `error_invalid_params`, `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_lighting_dark`.

**Units:** 1–4 non-zero concerns cost 4; 5–10 cost 6.

### 5.10 AI Facial Color Tones Analyzer, a.k.a. skin tone analysis (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_skin_tone_analysis.

**Endpoints:** `POST /s2s/v2.0/task/skin-tone-analysis` and `GET /s2s/v2.0/task/skin-tone-analysis/{task_id}`.

**Body**

- `src_file_id` or `src_file_url`.
- `face_angle_strictness_level`: optional, default `high`. The levels set these angle limits:

  | Level | Pitch | Yaw | Roll |
  |---|---|---|---|
  | `strict` | ≤ 4° | ≤ 6° | ≤ 4° |
  | `high` | ≤ 10° | ≤ 10° | ≤ 10° |
  | `medium` | ≤ 15° | ≤ 15° | ≤ 15° |
  | `low` | ≤ 20° | ≤ 20° | ≤ 20° |
  | `flexible` | ≤ 30° | ≤ 30° | ≤ 30° |

**Poll result:** `data.results` contains two objects, and there is no image URL.

- `face_quality`: `{has_face, area, frontal, lighting, faceangle}`. Every field except `has_face` is a string such as `"good"`.
- `color`:
  - `skin_color`, `eye_color`, `lip_color`, `eyebrow_color`: hex values
  - `eye_color_name`: `Amber`, `Brown`, `Green`, `Blue`, `Gray` or `Other`
  - `hair_color`: one of 7 hex values
  - `hair_color_name`: `Auburn`, `Black`, `Blonde`, `Brown`, `Grey/White` or `Red`

Fixture: `docs_examples/skin_tone_poll.json`. Note that the docs example omits `face_quality`.

**Input limits**

- Long side ≤ 4096 px, a single person, < 10 MB, jpg, jpeg or png.
- Each side must be at least 320 px. Images larger than 1080 px are auto-resized.
- The face width must be greater than 60% of the image width.

**Errors:** `error_below_min_image_size`, `error_face_position_invalid`, `error_face_position_too_small`, `error_face_position_out_of_boundary`, `error_face_not_forward_facing`, `error_face_angle_{upward,downward,leftward,rightward,left_tilt,right_tilt}`.

**Units:** 20.

### 5.11 AI Fitzpatrick Skin Type Analysis (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_fitzpatrick_skin_type.

**Endpoints**

- Optional pre-process step, used when there may be several faces: `POST /s2s/v2.0/task/fitzpatrick-scale-analyzer/pre-process` with `{src_file_id|src_file_url}`. Poll it with `GET …/pre-process/{task_id}`, which returns `data.results = {timed:number, result:[{left,top,width,height}]}`.
- Main task: `POST /s2s/v2.0/task/fitzpatrick-scale-analyzer` and `GET /s2s/v2.0/task/fitzpatrick-scale-analyzer/{task_id}`.

**Body:** `src_file_id` or `src_file_url`, plus:

- `version`: `"1.0"`. **Required in the schema.**
- `index`: integer, default 0. The zero-based index of the face from the pre-process result.

**Poll result:** `data.results = {fitzpatrick_scale: "I"|"II"|"III"|"IV"|"V"|"VI", timed: number}`. `timed` is in seconds.

> **Note.** The overview table mislabels Type IV as "Type V". The enum is correct.

**Input limits**

- Long side ≤ 4096 px, short side ≥ 320 px, < 10 MB.
- **jpg or jpeg only.** PNG is not listed.

**Errors:** `error_below_min_image_size`, `error_face_position_invalid`, `error_face_position_too_small`, `error_face_position_out_of_boundary`, `error_insufficient_lighting`, `error_face_angle_invalid`.

**Units:** 10. The pre-process step appears to be free (**Unverified**).

### 5.12 AI Face Attributes & Ratio Analyzer (Confirmed)

Source: https://docs.perfectcorp.com/reference/ai_face_analyzer.

**Endpoints:** `POST /s2s/v2.0/task/face-attr-analysis` and `GET /s2s/v2.0/task/face-attr-analysis/{task_id}`.

**Body**

- `src_file_id` or `src_file_url`.
- `features: string[]`: **required**. Values:
  - Face: `faceShape`
  - Eyes: `eyeShape`, `eyeSize`, `eyeAngle`, `eyeDistance`, `eyelid`
  - Brows: `eyebrowShape`, `eyebrowThickness`, `eyebrowDistance`, `eyebrowShortness`
  - Other attributes: `cheekbones`, `lipShape`, `noseWidth`, `noseLength`, `age`, `gender`
  - Colors: `eyeColor`, `lipColor`, `eyebrowColor`, `hairColor`
  - Ratios: `horizontalThird`, `verticalFifth`, `faceAspectRatio`, `eyeAspectRatio`, `eyebrowPosition`, `eyebrowArch`, `eyeHeightToEyebrowDistance`, `noseAspectRatio`, `noseWidthToMouthWidth`, `noseToLipToChin`, `upperLipToLowerLip`
- `face_angle_strictness_level`: optional, the same as §5.10.

**Poll result:** `data.results` contains the following objects.

- `face_quality`: the same shape as §5.10.
- `faceshape`: `Triangle`, `Diamond`, `Heart`, `InvTriangle`, `Oblong`, `Oval`, `Round`, `Square` or `Unknown`.
- `agegender`: `{age:int, gender:"female"|"male"|"unknown"}`.
- `eyelid`:
  - `left_eyelid`, `right_eyelid`: `Hooded-lid`, `Single-lid`, `Double-lid` or `Deep-Set`
  - `left_angle`, `right_angle`: `Downturned`, `Upturned` or `Average`
  - `left_shape`, `right_shape`: `Narrow`, `Round` or `Almond`
  - `setting`: `Close-set`, `Wide-Set` or `Average`
  - `size`: `Big`, `Small` or `Average`
- `eyebrow`:
  - `gap`: `Far-Apart`, `Close` or `Average`
  - `left_shape`, `right_shape`: `Hard Angled`, `Soft Angled`, `Straight`, `Rounded` or `Obscured`
  - `left_body_thickness`, `right_body_thickness`, `left_tail_thickness`, `right_tail_thickness`: `Dense`, `Sparse`, `Average` or `Unknown`
  - `left_thinness`, `right_thinness`: `Thin` or `Normal`
  - `left_shortness`, `right_shortness`: `Short` or `Normal`
- `lipshape`: an array of values from `Bow`, `Downturned`, `Full`, `Heavy Lower Lip`, `Heavy Upper Lip`, `Narrow`, `Round`, `Thin`, `Wide` and `Average`.
- `nose`: `width` is `Narrow`, `Broad` or `Average`; `length` is `Long`, `Short` or `Average`.
- `cheekbone`: `left`, `right` and `overall`, each one of `Flat Cheekbone`, `High Cheekbone`, `Low Cheekbone` or `Round Cheeks`.
- `color`: the same shape as §5.10 but without `skin_color`.
- `facialratio`: each ratio is a list of numbers.
  - `horizontal_third`: 3 percentages.
  - `vertical_fifth`: 5 percentages.
  - These fields are `[1, r]` pairs: `face_aspect_ratio`, `left_eye_aspect_ratio`, `right_eye_aspect_ratio`, `left_eyebrow_arch_to_eyebrow_width`, `right_eyebrow_arch_to_eyebrow_width`, `left_eye_height_to_eyebrow_distance`, `right_eye_height_to_eyebrow_distance`, `overall_eye_height_to_eyebrow_distance`, `nose_aspect_ratio`, `nose_width_to_mouth_width`, `nose_to_lip_to_chin`, `upper_lip_to_lower_lip`.
  - The result field for `eyebrowPosition` is not documented (**Unverified**).
  - Whether only the requested features appear in the result is also **Unverified**.

No example is quoted in the docs. `schema_derived/face_analyzer_poll.json` is built from the schema.

**Input limits:** the same as §5.10. Long side ≤ 4096, ≥ 320 px, face width > 60% of the image width, single person, jpg, jpeg or png.

**Errors:** the same as §5.10.

**Units:** 1–5 features cost 10; 6–14 cost 20; 15–28 cost 30.

---

## 6. MCP (alternative to REST)

Confirmed: https://docs.perfectcorp.com/develop/mcp.

**Servers.** These are streamable HTTP servers that use the same auth header, `Authorization: Bearer <API_KEY>`:

- `https://mcp-api-01.makeupar.com/mcp/beauty`: skin analysis, simulation, color tones, face analyzer, Fitzpatrick, makeup and look VTO, makeup transfer and hair tools.
- `https://mcp-api-01.makeupar.com/mcp/fashion`: clothes, fabric, shoes, jewelry and watches.
- `https://mcp-api-01.makeupar.com/mcp/creators`

**Tool names on the beauty server**

- `AI_Skin_Analysis`
- `AI_Skin_simulation`
- `AI_Facial_Color_Tones_Analyzer`
- `AI_Face_Attributes_and_Ratio_Analyzer`
- `AI_Fitzpatrick_Skin_Type_Analysis`
- `AI_Makeup_Virtual_Try_On`
- `AI_Makeup_Transfer`
- `AI_Look_Virtual_Try_On`
- `AI_Hair_Style_Virtual_Try_On`
- `File_Upload`
- `Get_Running_Task_Status`
- `Get_Upload_API_Info`
- `Get_Feature_Cost`
- `*_Templates`

**Tool names on the fashion server:** `AI_Clothes_Virtual_Try_On`, among others.

The MCP tool input schemas were not inspected (**Unverified**). REST is the documented and recommended path for backend code.

---

## 7. Corrections to the earlier hints

| Hint | Verdict |
|---|---|
| `POST /s2s/v1.1/file/{feature}` | **Outdated.** The current endpoint is the universal `POST /s2s/v2.0/file`, with no feature in the path. The response is wrapped as `data.files[0].{file_id, requests[0].{method,url,headers}}`. |
| Upload with a PUT to the presigned URL | Correct. Send exactly the returned headers. |
| `POST /s2s/v2.0/task/{feature}` and `GET …/{task_id}` | Correct. However, Skin Analysis V2.1 and Hairstyle V2.1 use the **`/s2s/v2.1/`** prefix. The jewelry slugs are `2d-vto/necklace` and `2d-vto/earring`. |
| Clothes slug `cloth` | That is **V2.0**. The latest is **`cloth-v4`**; V3 is `cloth-v3`. All three cost 2 units. |
| `garment_category`: `upper_body`, `lower_body`, `full_body`, `auto` | Incomplete. **`shoes`** is also valid in V2, V3 and V4, and **`outer`** in V4 only. The field is required whenever a reference image is used. |
| Skin analysis rejects small faces | Correct. The face width must be greater than 60% of the image width (`error_src_face_too_small`). |
| Skin analysis has unit tiers | Correct: SD costs 9/12/14/16 and HD costs 12/16/20/22 for 1–4, 5–8, 9–12 and 13–16 concerns. |
| Base URL `yce.perfectcorp.com` or `yce.makeupar.com` | Neither. The API host is **`https://yce-api-01.makeupar.com`**. |
| RSA secret key or `id_token` auth | Not needed. Use a plain Bearer API key, which was confirmed live. |
| Skin analysis results | The default `format` is `zip`. Send `format:"json"` to get `data.results.output[]` inline. |

## 8. Fixture index

- `fixtures/youcam/credit_balance.json`: raw response from the live `GET /s2s/v1.0/client/credit`.
- `fixtures/youcam/feature_cost.json`: all 102 SKUs from the live `GET /s2s/v2.0/credit/feature-cost`.
- `fixtures/youcam/docs_examples/*.json`: examples quoted verbatim in the official docs. Each file is wrapped as `{_source, _note?, example}`. The only edits were removing `//` comments and trailing commas, and quoting one unquoted token.
- `fixtures/youcam/schema_derived/*.json`: shapes built from the OpenAPI schemas, for features that have no example in the docs. The values in them are illustrative.

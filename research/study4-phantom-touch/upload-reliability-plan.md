# LUIDA データ送信の完了確認・失敗・再送（後回しにした設計メモ）

- 作成日: 2026-11-06。`session-reset-plan.md` 改訂 2 で設計し、同日の判断で **今回の実装範囲から外した** 内容をここに退避する。
- 判断の理由（ユーザ、2026-11-06）: 本実験（Study 4）の送信データは小さく、一般的な回線なら End の 10 秒待機で送信は終わる。10 秒で送れない回線ではセッション自体が正常に進行していない可能性が高く、得られても廃棄されうる。したがって送信確認の作り直し（約 250 行、LUIDA 全体に影響）は後回しにし、先に「同一インスタンスで次の参加者が実験を最初から始められる」機能を進める。
- 着手するときは、本メモの §1 の事実を再確認してから §2 の設計を使う。SessionReset（`session-reset-plan.md`）とは独立に価値がある（§1.3 の 100 KB 超の問題）。

---

## 1. 確認した事実（2026-11-06 時点のコード）

### 1.1 `CustomDataUploader.js`（`Runtime/Scripts/CustomDataCollection/`）
- `exp_uploadCustomData` → `uploadDataInit()`（`steps = ceil(バイト数 / 100 KB)`）→ 1 s 後から 1 s 間隔で `uploadDataStep()`。`sID` は送信時に `$.groupState.sessionID` から付ける（L99）。行自体は sID を持たない。
- 最後のステップを **発行した直後に** `customData = []`, `isUploading = false`（L108–112）。応答は `onExternalCallEnd` でログに出すだけ（L34–44）。再送なし。
- Cluster 側: request は 100 kB 以下（超えると `requestSizeLimitExceeded`）。エンドポイントが 5 秒で応答しなければ失敗、cluster からの再送なし。応答は `onExternalCallEnd` に必ず 1 回（失敗なら `res == null`）。オーナーが応答前に退室したときコールバックがどうなるかは未記載。

### 1.2 バックエンドの保存（`luida-frontend/app/api/experiments/[experimentId]/customData/route.ts`）
- key `"<fileName> sID_<sID> pID_<pID>.json"`（DataCollector は `fileName = "data"`, `pID = ""`）に `PutObject` → **同じ sID の 2 回目の送信は前回の内容を置き換える**（L541–558）。`pInfo` は配列に追記、`idfc2userId` はマージ。
- ファイル単位の S3 エラーは catch してログに出し、**それでも 200 と `{ message, results }`** を返す（L560–590）。`results` には成功したファイル名だけ。
- ラッパ `app/api/cluster/route.ts` `handleUploadCustomData`（L150–154）は `{ success: true, message, data: result.data }` を返すが `result.data` は存在しない → `results` は捨てられている。失敗時は `{ success: false, message, error }`（L141, L159）。
- GET（Web Console のダウンロード）はプレフィックス配下の全ファイルを zip にするだけなので、1 セッションに複数の data ファイルがあっても問題ない。

### 1.3 Study 4 に対する直接の危険: 分割送信が壊れている
- 分割は「バイト数で段数を決め、100 行ずつ切る」。行数が少なく 1 行が大きい（`trace` 付き）場合、段 0 が全行（100 KB 超なら送信エラー）、段 1 が **空配列** を送り、1.2 の置き換えでファイルが `[]` になる。
- Study 4 の trace は 10 Hz × 最大 400 サンプル × 約 60 文字 ≈ 最大 24 KB/試行。4 試行で最大 90 KB 前後 + 他の列。**End の送信が 100 KB を超えるとデータが消える。** 実データの行サイズを早めに測ること（R9）。

### 1.4 質問紙と pInfo
- `FormController.js` の `postQuestionAnswers` 応答: null でなければ「Answers recorded!」として次へ進む（L354–360）。ラッパ（cluster/route.ts L389–399）は失敗時も 200 で `"Failed to submit answers!"` / `"Error while submitting answers!"` という文字列を返す。→ 成否は見ていない。
- 通信レベルで失敗（`res == null`）すると `onExternalCallEnd` は先頭で return し（L329–332）、`qCompletedCount` が増えず **参加者はその状態から出られない**。
- `ParticipantManager.js` の pInfo 送信（L60–75）は応答をログに出すだけ（L266–271）。
- eligibility の通信失敗は「参加可能」として進める（L218–225）。

---

## 2. 設計（改訂 2 のまま。着手時に見直す）

### 2.1 `CustomDataUploader.js` — 固定バッチ・バイト分割・チャンク固有ファイル名・応答管理

```
用語: batch = exp_uploadCustomData 1 回ぶんの行の集合。開始時に customData から切り離して固定
      chunk = batch をバイト数で分けた 1 リクエストぶん。固有のファイル名を持つ
状態（$.state）: customData（未送信の行）, batches[]（{ id, sID, chunks[] }）, batchSeq, elapsedTime, failed, lastError, up_sid
chunk: { k, file, rows, state: 'queued'|'issued'|'acked'|'failed', retries, age }

uploadDataInit()（busy でないときだけ。busy 中は exp_uploadCustomData を消費せず、空いたら走る）
  rows = customData; customData = []           ← 固定。以後 recordData() の行は次の batch
  rows が空なら何もしない
  sID が前の batch と違えば failed = 0, lastError = null
  chunks = splitByBytes(rows, 90000)            ← utf8ByteLength(JSON.stringify(行の配列)) で貪欲に切る。1 行で超える行は単独 chunk + 警告
  file: batch 1 の chunk 0 は "data"（現行と同じ名前・内容 = 後方互換）、それ以外は "data_b<id>_c<k>"
issueNext()（busy 中、1 s ごと）: 'queued' の最初の chunk を発行
  request = JSON.stringify({ type: "uploadCustomData", token, data: { [file]: rows }, eID, sID: batch.sID })  ← 決定的。再送は同じ文字列
  callExternal(endpoint, request, "customDataUploaded_<id>_<k>"); state = 'issued'; age = 0
onUpdate: issued の chunk の age += dt。age > 15 s で応答なし → 'queued' に戻して再発行（retries += 1）。同名に同内容なので冪等
onExternalCallEnd("customDataUploaded_<id>_<k>")
  ok = res != null && parsed.success !== false
       && (!Array.isArray(parsed.results) || parsed.results.some(r => r.fileName.startsWith(file + " ")))   ← results が返る場合はファイル名まで確認（§2.4）
  ok → 'acked'。batch の全 chunk が acked なら batches から除く
  失敗 → retries < 3 なら 'queued'、超えたら 'failed', failed += 1, lastError
busy() = いずれかの chunk が 'queued' か 'issued'
publish() → $.groupState.luida_upload = { sID, buffered, uploading: busy(), pending, failed, lastError, batches }
luida_reupload（手動復旧用）: 'failed' を 'queued' に戻し failed = 0
```
- 後方互換: 1 セッション 1 回・90 KB 以下はファイル名も内容も現行と同一。2 回目以降や 90 KB 超は別ファイルに残る（現行は置き換えで消える）。分析スクリプトは sID ごとに `data*` を結合する前提にする。
- `$.state` の容量: リクエスト文字列は保持せず発行時に組み立てる。

### 2.2 `FormController.js` — 応答判定と再送
- `submitAnswers()` でリクエスト文字列を `$.state.submitRequest` に保持。
- `postQuestionAnswers` の応答で `failed = (res == null) || /^(Failed|Error)/.test(res)`。失敗なら 3 回まで同じ文字列を再送。使い切ったら `$.groupState.luida_qFailed += 1` とログを出し、それでも完了として次へ進む（閉じ込めない）。
- `res == null` の先頭 return（L329–332）は `getQuestions` では残し、`postQuestionAnswers` では上の判定に通す（通信失敗で出られない問題も直る）。

### 2.3 `ParticipantManager.js` — pInfo の再送と状態の問い合わせ
- pInfo のリクエスト文字列を保持し、`customDataUploaded` の応答で `res == null || parsed.success === false` なら 3 回まで再送、使い切ったら `pInfoFailed = true`。
- `luida_status {token}` → `luida_status_ack { token, sessionID, qFailed, pInfoFailed, pInfoPending }` を返信（SessionReset の drain 用）。

### 2.4 バックエンド（推奨、3 行）
- `handleUploadCustomData` の `data: result.data` を `results: result.results` に（または併記）。古いワールドは `results` を見ないので影響なし。
- 本当の保存状態を問い合わせる `getSessionUploadStatus(eID, sID)` は、期待値（行数・質問紙の数）を実験ごとに持つ必要があるため見送り。

### 2.5 SessionReset 側（`session-reset-plan.md` に戻すときの差分）
- `end` と `reset` の間に `drain` フェーズ: `luida_upload` が「uploading false ∧ buffered 0 ∧ pending 0 ∧ failed 0」かつ `luida_status_ack` が「qFailed 0 ∧ !pInfoFailed ∧ !pInfoPending」のときだけ進む。状況が無ければ成功扱いしない。失敗／45 s 超は止まる（`SR_ON_DRAIN_TIMEOUT = 'block'` 既定）。警告行は **送らない**（1.2 の置き換えで本体を消す）。
- Instruction の End 文言に `error === 'upload'`（「前の参加者のデータ送信を確認できませんでした」）を追加。

---

## 3. テスト（着手時）
| ID | 内容 | 期待 |
|---|---|---|
| M1 | Uploader モック: 1 チャンク成功 / 失敗→再送→成功 / 3 回失敗 / 応答なし 15 s → 再発行 / 送信中に `recordData()` 追加 / sID 変更後の新 batch | 行が応答まで残る、再送は同じ文字列、`failed` 計数、追加行は次の batch、ファイル名 |
| M2 | Uploader モック: 90 KB 超で複数チャンク、応答順序の逆転、片方だけ失敗 | 固有ファイル名で全部送られる、順序非依存、失敗チャンクだけ再送 |
| M3 | Form モック: `"Failed…"` / `null` / 正常 | 3 回再送、使い切りで `luida_qFailed` 加算して完了扱い |
| R7 | 実機: バックエンドを (a) 6 s 以上待たせる (b) `success:false` (c) 質問紙で `"Failed…"` | (a) 再送で復旧 (b) `failed = 1` で drain 停止 (c) `qFailed = 1` で drain 停止 |
| R9 | 実機: 100 KB 超（trace の長い 4 試行、または `chunkByteLimit` を一時的に 20 KB に） | `data` と `data_b1_c1…` が全部保存され行数が一致 |

## 4. リスク
- 再送の二重登録: pInfo は追記、質問紙は DB 追加なので「保存されたが応答が失われた」場合に二重になる（DataCollector は置き換えなので二重にならない）。分析側で重複除去するか、バックエンドに冪等キー（sID + qID + pID）を持たせる。
- 既存ワールドへの影響: 成功時の経路とファイル名は同一。失敗時の挙動（再送、閉じ込め解消、別ファイル保存）だけ変わる。

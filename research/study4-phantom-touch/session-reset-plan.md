# Study 4（PhantomTouch）: 同一インスタンスで次の参加者を迎えるためのセッションリセット 実装計画

- 作成日: 2026-11-06 / 改訂 1・2: 同日、レビュー反映 / 改訂 3: 同日、範囲を確定 / **改訂 3.1: 2026-11-07、3 回目のレビュー反映（範囲は不変）**（§9）
- 対象シーン: `Assets/_Experiment_/Scenes/PhantomTouch.unity`（branch `hao/phantom-touch`）
- **実装: 2026-11-07**（改訂 3.1 どおり。設置手順・テスト・既知の制約は `IMPLEMENTATION_NOTES.md` §8。実機テスト R1〜R7 は未実施）
- 関連: `implementation-plan.md`（設計書）, `IMPLEMENTATION_NOTES.md`（実装メモ）, **`upload-reliability-plan.md`（後回しにした送信確認の設計）**
- 根拠はファイルパス付きで示す。CCK の Logic は `Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/**` の YAML を読み解いた結果（2026-11-06）。

---

## 0. 結論と今回の範囲

**可能。** 今回の完了条件は「**現行の送信処理と End の 10 秒待機を維持したまま、同一インスタンスで次の参加者が正常に実験を開始・完了できること**」。送信成功の保証は範囲外（判断と理由は §8）。前提は次の 4 点。

1. **リセットは「次の参加者が入室した瞬間」に実行する。** Cluster では誰もいない空間のスクリプトは実行されない（docs.cluster.mu/script「誰もいない空間のスクリプトは実行されません」）。「End 到達済み・End 開始から一定のスクリプト時間経過・前の参加者が退室済み・誰かが入室している」を検出したときにリセットする（reset-on-next-join）。前の参加者がまだいる End 中にリセットすると、ParticipantManager（PM）がその人をもう一度登録してしまう。
2. **リセット自体の完了は確認してから次へ進む。** Global の初期化と ConditionManager（CM）の初期化を確認してから PM を初期化する。2 人目の登録が再開するのは **PM の初期化が終わった時点** で、PM の応答（ack）はその完了通知。確認できなければ止まり、2 人目は登録されない（PM の初期化が最後なので構造上ブロックされる）。状態の初期化に失敗したまま次の参加者を登録すると、この機能の目的を満たせない。
3. **LUIDA 本体のスクリプト 3 本に小さな追加が要る**（§3.1）。`$.state` はアイテム私有で外から触れないため、CM の `isLast`（戻さないと 2 人目の試行ループが 1 試行で終わる）、質問紙 FormController の `isParticipantAssigned` / `isSubmitted`（戻さないと 2 人目に質問紙が出ない）、PM の `eligibleCount` / `participantsEnvInfo` / `sessionID` 生成（戻さないと pInfo に前の参加者が混ざる）は本体側で戻すしかない。各 10〜40 行、メッセージハンドラと自己初期化の追加のみで既存の経路は変えない。SessionReset の無いワールドでは呼ばれず、挙動は変わらない。
4. **End のゲートの出し方を変える。** いまは退出ゲートを参加者の足元（＝スポーン地点）に出して残すので、次の参加者がスポーンした瞬間にゲートに触れて募集ワールドへ送り返される。PM の拒否処理と同じ「遠くに置いたゲートへ参加者をテレポートする」方式に変える（§3.2.3）。

バックエンド（luida-frontend）は変更不要。新しい `sID` で `checkJoinEligibility` を呼べば新しい SessionMetadata 行ができ、条件の均衡割付・`maxSessionCount` の計数・データファイルの分離はそのまま機能する（§1.8）。

---

## 1. 確認した事実（根拠）

### 1.1 Cluster の仕様（docs.cluster.mu/script, `Assets/Doc/CCK-Types.d.ts`, 2026-11-06 取得）
- `$.onStart` は「Creator Kit 製ワールドで、スペースが新規で始まるとき」に 1 回だけ。再入室では呼ばれない。
- 「誰もいない空間のスクリプトは実行されません。」→ 退出後にタイマーで何かする設計は不可。Update の `deltaTime` 積算もスクリプト停止中は進まない。
- `PlayerHandle.exists()` は退室済みなら `false`（d.ts L2416）。
- `$.state` / `$.groupState` はスペースが存続する限り保持される前提。**空のスペースがどれだけ存続するかは公式ドキュメントで確認できなかった**（§8）。
- スクリプトを書けるのは `"this"` / `"owner"` のステートのみ。Global のステートは CCK の Logic（GlobalLogic）でしか書けない。ただし **読む** のは `$.getStateCompat("global", key, type)` でできる（`StateListeningItemBase.js` L31）。
- `$.onReceive` の `sender` は ItemHandle | PlayerHandle で、`sender.send()` で返信できる（d.ts L720–770）。

### 1.2 LUIDA のステートマシンは CCK Logic だけで動いている
`Prefabs/StateManagement/StateTransition.prefab`（各ステートの `Transition` アイテム）:

| トリガ | 書き込み |
|---|---|
| アイテム生成時 | `state_setID` → `state_id = <i>`, `state_repeatCountMax = 1`; `state_isActive = false` |
| Global 信号 `state_entered` | `state_isActive = state_enter = (Global.state_currentID == state_id)` |
| Global 信号 `state_exited` | `state_exit = state_isActive`; `state_isActive = false` |
| Global 信号 `state_triggerTransition` | `state_isActive` なら 0.2 s 後に自アイテムの `state_tryTriggerTransition` |
| 自アイテム `state_triggerTransition` | GlobalLogic: `state_exited`(signal) → `state_currentID = <遷移先>` → `state_entered`(signal) |

- 実験開始: PM が `exp_StartStateTransition` → `LUIDA-ExpManagers` の GlobalLogic が Global 信号 `state_entered` を出す（`state_currentID` は初期値 0 なので Start が有効になる）。
- PhantomTouch の `End` の遷移先は `-1`。End から先は誰も遷移を起こさないので、実験後は `state_currentID = 11`、End の `state_isActive = true` のまま。
- `Trial - Rest`: `state_exited` → `exp_trialID += 1` → `state_currentID = Condition(Global.exp_readyToLeaveTrials, 8 [SocialPresence], 2 [Trial - Start])` → `state_entered`。**`exp_readyToLeaveTrials` を false に戻す Logic はどこにもない**。
- `ConditionManager.prefab`: `exp_toNextCondition` → `exp_trialID += 1`; `exp_resetTrials` → `exp_trialID = 0`; 自アイテム信号 `exp_readyToLeaveTrials` → Global bool `exp_readyToLeaveTrials = true`。
- `ParticipantManager.prefab`: 生成時 `exp_arePlayersEnough = false`, `exp_showWaitingMessage = true`; `exp_playersAreEnough` → `exp_arePlayersEnough = true`, `exp_showWaitingMessage = false`; `OnJoinPlayerTrigger` → 入室したプレイヤーの移動速度 = `exp_arePlayersEnough ? 1 : 0`。
- State-listening item: `state_entered` / `state_exited` を自アイテムの bool `state_enter` / `state_exit` に落とし、`StateListeningItemBase.js` が `state_currentID` を読んで該当ステートのアクションを実行する。基底は `$.onReceive` を登録していないので、各アイテムの legacy code が自分の `$.onReceive` を登録できる。

### 1.3 ParticipantManager.js（`Runtime/Scripts/ParticipantHandler/`）
- `$.onStart` で `sessionID` 生成、`participants = []`、`isParticipantsEnough = false`、`eligibleCount = 0` など（L25–41）。
- 1 秒ごとに新規プレイヤーを検出して登録するのは **`!$.groupState.isParticipantsEnough` のときだけ**（L45–59）。
- 登録 → `initializeParticipant` → `envInfoResponse` → `checkJoinEligibility` → `eligibleCount >= pNum` で `HandleParticipantsEnough()`（`exp_playersAreEnough`, `exp_StartStateTransition`, CM へ `luida_existing_conditions` / `luida_participants_info`）。eligibility の通信失敗は「参加可能」として進める（L218–225）。
- CM は `luida_participants_info` を受けると `betweenSubjectsCondition` を返信し、PM はそれを受けて `saveSessionConditions` を呼ぶ（L119–133）。バックエンドは該当 `sID` の行が無いと `SESSION_NOT_FOUND`（route.ts L709）。→ **リセット時に PM から `luida_participants_info` を送ってはいけない**（新 sID の行はまだ無い）。完了は返信メッセージで知らせる（§3.1.1）。
- `onReceive` は `{ item: true, player: true }`。

### 1.4 ConditionManager.js
- `$.onStart`: `isServerAssigned = false` → `initializeBetweenSubjectsConditions()` → `reset()` → PM に `betweenSubjectsConfig`（1 回だけ）。
- `updateCondition()` は最終試行で `isLast = true` にして `exp_readyToLeaveTrials` を 1 回だけ送る。`reset()` は **`isLast` を戻さない**。
- `$.onUpdate` は `$.state.trialID !== Global exp_trialID` のときだけ `updateCondition()`。End の時点で `exp_trialID` は 0 なので、`reset()` で `trialID = 0` にしても余計な `updateCondition()` は走らない。

### 1.5 質問紙 FormController.js（`Runtime/Scripts/Form/`, `Questionnaire.prefab`）
- 参加者の割当は `!isParticipantAssigned && $.groupState.isParticipantsEnough` のとき 1 回だけ（L10–20）。送信後は `reset(false)` で `isInitiated = isSubmitted = true` となり二度と開かない。`form_show_start_hint` も false のまま。
- `onReceive` は先頭で `if (!isInitiated || isSubmitted) return;`。→ `$.groupState.sessionID` の変化を自分で検知して初期化する（§3.1.3）。
- 開くたびに `questions = []` にしてから取得する（L25）ので、再初期化で設問が重複することはない。
- 回答送信は応答（null 以外）を受けてから次のステートへ進む（L354–360）。応答の中身は見ていない（`upload-reliability-plan.md` §1.4）。

### 1.6 データ収集（`CustomDataUploader.js`, `LUIDA-DataCollector.prefab`）
- `exp_uploadCustomData` → 1 s 後に `uploadDataStep()`（`sID = $.groupState.sessionID`、CM グループ側のコピー）。発行直後に `customData = []`。応答はログのみ。
- End では NpcDirector が開始直後に `exp_uploadCustomData` を送り（builder L1408）、退出ゲートは 10 s 後（`EndGateDelaySec`）。Study 4 の送信はこの 1 回だけ。
- **リセットが守るべきこと**: End の送信が **発行される前** に `sessionID` を変えない。CM グループ側の `sessionID` は P2 の `HandleParticipantsEnough` でしか変わらないので、「End 開始からスクリプト時間 5 s」のガード（§2）で発行は旧 sID で行われる。これは発行の保証であって成功の保証ではない（§8）。

### 1.7 アイテムグループは 2 つある（リセット設計で重要）
| ホスト | メンバー | `$.groupState` の中身 |
|---|---|---|
| PM の `ItemGroupHost` | 質問紙 FormController ×4 | `participants`, `isParticipantsEnough`, `sessionID`, `qCompletedCount` |
| CM の `ItemGroupHost` | State-listening item ×7, `LUIDA-DataCollector`, `StateLogger`, NPC | `participants` / `sessionID`（PM から `luida_participants_info` でコピー）, `currentCondition`, `stateNames`, `collectedData` |

→ シーン側のリセット用アイテム（CM グループ）から PM グループの状態は読めない。PM には **メッセージと返信**（`luida_reset` / `luida_reset_ack`）で扱う。CM グループ内では `$.groupState` を介して状態を公開できる。

### 1.8 バックエンド（`C:/Users/Hao/projects/luida-frontend/app/api/cluster/route.ts`）
- `checkJoinEligibility(eID, sID, envInfo)`: `SessionMetadata(eID, sID)` が無ければ `checkSessionStatus` → 行を作成 → `existingConditions` を返す。有れば `{ eligible: true }` のみ。
- `saveSessionConditions` は既存行を更新（無ければ `SESSION_NOT_FOUND`）。`uploadCustomData` は `sID` ごとに `"data sID_<sID> pID_.json"` を置き換えで保存。
- したがって **参加者ごとに新しい `sID` を生成すれば、「1 人 = 1 セッション」として扱われる**。同じ `sID` を使い回すと 2 人目は条件均衡も `maxSessionCount` の計数も効かず、データも同じファイルを置き換える。

### 1.9 現在の End（`ExitPortal`）
- `ep_update()`（builder L1847–1868）が 10 s 後に `WorldGateToLuidaBar` を **`gate.setPosition()` で参加者の足元へ動かして** 有効化する。参加者はスポーン地点に立っているので、ゲートはスポーン地点に残る。
- 次の参加者はスポーン地点に湧く → ゲートのトリガに入る → 即座に募集ワールドへ送り返される。スクリプトのリセットが走る前に起きる。
- ゲートの実行時の位置はスクリプトが決めている。`ApplyLayout`（L604–613）はローカル原点に「駐車」しているだけ。

---

## 2. 設計: reset-on-next-join（リセットの各段階を確認して進む）

```
P1: … → Debrief → End（NpcDirector: exp_uploadCustomData → 1 s 後に発行。10 s 後に ExitPortal が P1 を遠方ゲートへテレポート）
     → P1 退室 → 空のスペース（スクリプト停止、状態は保持）
P2 入室 → スクリプト再開（アイテムのオーナーは P2 のクライアント）
SessionReset（新しい state-listening item。Update で 0.5 s ごとに判定。phase は $.state に持つ）
  [end]    state_currentID == End ∧ End 開始からスクリプト時間 ≥ 5 s（送信の発行待ち。§1.6）
           ∧ PARTICIPANTS[1] が exists() でない ∧ 誰かが入室中                   → reset へ
  [reset]  token を発行（旧 sID + 時刻）
           自アイテム信号 exp_sessionReset → GlobalLogic ×5:
             state_exited(signal), state_currentID = 0, exp_trialID = 0,
             exp_readyToLeaveTrials = false, exp_arePlayersEnough = false
           $.groupState.participants = [], collectedData = {}（CM グループ）
           NPC.send('npc_hide'); CM.send('luida_reset', {token})                    → settle へ
  [settle] 確認: Global 4 値が戻っている ∧ $.groupState.luida_resetAck == token
           未確認なら 2 s ごとに信号と luida_reset を再送（ハンドラは token で冪等）
           15 s 超で指示板にエラー表示。進まない                                   → pm へ
  [pm]     PM.send('luida_reset', {token}) → PM の initSession() が終わった時点で登録が再開する（最後の段階）
           luida_reset_ack {token} は完了通知。ack か Start（= 登録済みの証拠、sr_idle()）で終わる
           未応答なら 2 s ごとに再送。15 s 超でエラー表示。進まない                → idle へ
  [idle]   PM が 1 s 以内に P2 を登録 → envInfo → eligibility（新 sID で新セッション行 + existingConditions）
           → HandleParticipantsEnough → exp_StartStateTransition → state_entered → Start
           → 質問紙 FormController は sessionID の変化を見て自己初期化 → P2 に割当
           → 以降は 1 人目とまったく同じ流れ
```

性質:
- **2 人目の登録は PM の初期化（最後の段階）まで構造上ブロックされる。** PM は `isParticipantsEnough` が false のときしか登録しない。途中で止まっても End に入り直したり古い試行状態で始まったりはしない。
- **登録を再開するのは PM の `initSession()` の完了であって、ack の到達ではない。** `isParticipantsEnough = false` は `initSession()` の最後の行なので、初期化が途中で失敗すれば登録は再開しない。ack は SessionReset への完了通知で、失われても 2 s ごとの再送で得られるし、先に Start が来れば `sr_idle()` で待機は終わる（Start は登録後にしか起きず、登録は PM の初期化完了後にしか起きない）。
- **順序の理由**: Global（`state_currentID = 0` など）と CM を先に戻し、確認してから PM を戻す。PM を戻した瞬間から P2 の登録が始まり、eligibility の往復後に `state_entered` が飛ぶので、そのとき `state_currentID` が 0 でなければならない。`exp_readyToLeaveTrials = false`（CCK）と `isLast = false`（CM）は **両方** 必要。
- **5 s ガード**: End の送信は End 開始の 1 s 後に発行される（分割時は 1 s/段）。P1 が End 直後にメニューから退出しても、P2 入室でスクリプトが再開した時点でまず旧 sID のまま発行され、その後にリセットされる。通常は P1 が 10 s 以上 End にいるので、ガードは P2 入室時点ですでに満たされている。
- 退出は「ゲートを足元に出す」ではなく「遠方のゲートへテレポート」にして、スポーン地点にゲートを残さない。

---

## 3. 変更一覧

### 3.1 LUIDA 本体（`Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Scripts/`）— 追加のみ

方針: 既存の初期化・メッセージ経路・送信処理は変えない。`luida_reset` ハンドラと自己初期化を **追加** する。SessionReset が無い既存ワールドでは呼ばれず、`$.groupState.sessionID` も変わらないので挙動は同じ（テスト I2）。

#### 3.1.1 `ParticipantHandler/ParticipantManager.js`
`$.onStart` の初期化（L25–41）を `initSession()` に切り出し、`luida_reset` で再実行する。`betweenSubjectsConfig` は CM がスペース開始時に 1 回しか送らないので **保持する**。完了は **送信元への返信** で知らせる（`luida_participants_info` は送らない。§1.3）。

```js
function initSession() {
  $.state.isBetweenSubjectsConditionsSet = false;
  $.groupState.sessionID = Date.now() + "_" + (Math.random() + 1).toString(36).substring(2, 8);
  $.groupState.participants = [];
  $.groupState.qCompletedCount = 0;          // 質問紙（同じグループ）の完了カウンタ
  $.state.participantsEnvInfo = [];
  $.state.idfc2userId = {};
  $.state.timer = 0;
  $.state.pendingEligibilityChecks = {};
  $.state.rejectionQueue = [];
  $.state.isProcessingRejection = false;
  $.state.rejectionTimer = 0;
  $.state.isSessionApproved = false;
  $.state.existingConditions = null;
  $.state.eligibleCount = 0;
  $.state.betweenSubjectsConditions = null;
  // $.state.betweenSubjectsConfig は保持
  $.groupState.isParticipantsEnough = false;  // 最後に: この行で登録が再開する（途中で例外が出れば再開しない）
}
$.onStart(() => { /* 既存のログ */ $.state.betweenSubjectsConfig = []; initSession(); /* 既存のゲート初期化 */ });

// $.onReceive の switch に追加
case "luida_reset": {
  const token = arg && arg.token;
  if ($.state.luida_lastResetToken !== token) {        // 再送に対して冪等
    initSession();                                     // 例外なら token は未保存・ack も送られず、2 s 後の再送でやり直す
    $.setStateCompat("this", "exp_showWaitingMessage", true);
    $.state.luida_lastResetToken = token;              // 初期化が終わってから保存する
    $.log("LUIDA session reset: new sID=" + $.groupState.sessionID);
  }
  sender.send("luida_reset_ack", { token: token, sessionID: $.groupState.sessionID });
  break;
}
```
- token は **初期化が例外なく終わってから** 保存する。途中で例外が出ると token は未保存で ack も送られないので、SessionReset の再送（2 s）でハンドラが初期化をやり直す（レビュー 3 の指摘 1。M2）。
- `isParticipantsEnough = false` は登録を再開する行なので `initSession()` の **最後** に置く。半端な状態（新しい `sessionID` だけ入って `eligibleCount` などが古いまま）で登録が始まらない。

#### 3.1.2 `ConditionManagement/ConditionManager.js`
`$.onStart` と同じ手順（`betweenSubjectsConfig` の送信を除く）を token 付きで再実行し、完了を CM グループの `$.groupState.luida_resetAck` に書く（SessionReset と同じグループなので直接読める）。

```js
case "luida_reset": {
  const token = arg && arg.token;
  if ($.state.luida_lastResetToken !== token) {
    $.state.isLast = false;              // reset() は戻さない（§1.4）
    $.state.isServerAssigned = false;
    $.state.betweenSubjectsConditions = {};
    initializeBetweenSubjectsConditions();   // テストモードでは乱数、実機では後で luida_existing_conditions が上書き
    reset();                                 // trialID = 0, 参加者内条件の再生成, currentCondition 更新
    $.state.luida_lastResetToken = token;    // 初期化が終わってから保存（例外なら ack も書かれず、再送でやり直す）
    $.log("[ConditionManager] session reset");
  }
  $.groupState.luida_resetAck = token;
  break;
}
```
- PM と同じく token は初期化の後に保存する。途中で例外が出れば `luida_resetAck` も書かれないので、`settle` は 2 s 後に `luida_reset` を再送し、ハンドラは初期化をやり直す（M2）。

#### 3.1.3 `Form/FormController.js`
非アクティブ中はメッセージが届くか保証できないので、`$.onUpdate` の **先頭**で `$.groupState.sessionID` の変化を検知して自己初期化する（PM と同じグループなので直接見える）。

```js
$.onUpdate((deltaTime) => {
    // LUIDA session reset: a new sessionID means a new participant; forget the previous one and reopen the form.
    if ($.state.boundSessionID !== $.groupState.sessionID) {
        const hadParticipant = !!$.state.isParticipantAssigned;
        $.state.boundSessionID = $.groupState.sessionID;
        if (hadParticipant) {
            $.state.participant = null;
            $.state.isParticipantAssigned = false;
            reset(true);                                            // answers, qID, isInitiated/isSubmitted = false, content off
            $.setStateCompat("this", "form_show_start_hint", true); // 「ここをクリック」ヒントを再表示
        }
    }
    if (!$.state.isParticipantAssigned && $.groupState.isParticipantsEnough) { /* 既存 */ }
    …
```
初回は `boundSessionID` が undefined → 代入のみ。`reset()` 内の `$.state.participant?.send(...)` は null 安全。コンテナが非アクティブの間に `onUpdate` が動かなくても、Start で有効化された最初のフレームで初期化 → 同じフレームで P2 に割当、という順序になる（初期化を割当より前に置くことが条件）。

#### 3.1.4 `CustomDataUploader.js` — 今回は変更しない
送信完了の追跡・再送・バッファの扱いは `upload-reliability-plan.md` に退避（§8 の判断）。バッファはリセットで **消さない**（行は sID を持たないので消せば失われる。現行どおり発行時に空になる）。

#### 反映
`.js` を編集するだけでよい。結合（`LuidaScriptCombiner.CombineAll`）は再生／アップロード前に自動実行され、§3.2.5 のメニューでも走る。トークンを含む結合済みプレハブは従来どおりコミットしない。

### 3.2 シーン側（`Assets/_Experiment_/Editor/PhantomTouch/Study4SceneBuilder.cs`）

#### 3.2.1 新しい state-listening item `SessionReset`
- `CreateSli(tab, "SessionReset")` → `AddItemGroupMember`（CM グループ）。表示物なし。位置はスポーン付近の床下。
- `AddWorldItemReference`: `NPC`（ルート `NPC`）, `ConditionManager`, `ParticipantManager`（`LUIDA-ExpManagers` 配下の prefab instance を `GetPrefabAssetPathOfNearestInstanceRoot` が `ConditionManagerPrefabPath` / `Runtime/Prefabs/ParticipantManager.prefab` のもので探す。`AddItemGroupMember` と同じ走査）。
- リスナー: `S_START` 開始で `sr_idle()`、`S_END` 開始で `sr_endBegin()`。イベントハンドラ `Update`: `sr_tick(deltaTime);`
- Legacy code（`SR_END_ID` は `S_END` から生成）:

```js
// ---- Study 4: SessionReset (next participant in the same instance) ----
// Scripts run only while someone is in the space, so the reset runs when the NEXT player joins and finds End
// with the previous participant gone. Phases: idle -> end -> reset -> settle -> pm -> idle.
// Each reset step waits for confirmation and never advances on a timeout. Enrollment stays blocked by construction
// until ParticipantManager has finished its own reset (the last step; ParticipantManager enrolls only while
// isParticipantsEnough is false, and its reset clears that flag last). 'luida_reset_ack' is a completion notice;
// Start (sr_idle) also ends the wait, because Start can only follow a completed ParticipantManager reset.
// Upload success is NOT verified (decision 2026-11-06, see the plan): SR_MIN_END_SEC only lets the existing
// uploader issue End's request under the old sessionID before anything is reset.
const SR_END_ID = 11;                     // = S_END
const SR_POLL_SEC = 0.5;
const SR_MIN_END_SEC = 5;                 // script time since End began (End's upload is issued 1 s after End begins)
const SR_RESEND_SEC = 2;                  // re-send while unacknowledged (handlers are idempotent per token)
const SR_ALERT_SEC = 15;                  // show an error on the instruction board after this long without confirmation

function sr_status(extra) {               // read by Instruction (same group) for the waiting / error texts
  $.groupState.luida_resetStatus = Object.assign({ phase: $.state.sr_phase || 'idle', token: $.state.sr_token || null }, extra || {});
}
function sr_phase(p) { $.state.sr_phase = p; $.state.sr_phaseSec = 0; $.state.sr_lastSend = -1e9; sr_status(); }
function sr_idle() { sr_phase('idle'); $.state.sr_pmAck = false; }
function sr_endBegin() { sr_phase('end'); $.state.sr_pollIn = 0; }
function sr_prevGone() { const p = PARTICIPANTS[1]; return !!p && !p.exists(); }
function sr_someoneHere() { return $.getPlayersNear($.getPosition(), Infinity).length > 0; }
function sr_globalsReset() {
  return $.getStateCompat('global', 'state_currentID', 'integer') === 0
      && $.getStateCompat('global', 'exp_trialID', 'integer') === 0
      && $.getStateCompat('global', 'exp_readyToLeaveTrials', 'boolean') === false
      && $.getStateCompat('global', 'exp_arePlayersEnough', 'boolean') === false;
}
function sr_send(id, msg, arg) {
  try {
    const h = $.worldItemReference(id);
    if (!h) { $.log('[SessionReset] missing world item reference: ' + id); return false; }
    h.send(msg, arg || {});
    return true;
  } catch (e) { $.log('[SessionReset] send ' + id + '/' + msg + ': ' + e); return false; }
}
function sr_due() {                      // rate-limit re-sends
  if ($.state.sr_phaseSec - $.state.sr_lastSend < SR_RESEND_SEC) return false;
  $.state.sr_lastSend = $.state.sr_phaseSec; return true;
}
function sr_startReset() {
  $.state.sr_token = ($.groupState.sessionID || 'none') + ':' + Date.now();
  $.state.sr_pmAck = false;
  $.log('[SessionReset] previous participant left after End; resetting for the next participant, token=' + $.state.sr_token);
  $.sendSignalCompat('this', 'exp_sessionReset');     // GlobalLogic x5 (see builder)
  $.groupState.participants = [];
  $.groupState.collectedData = {};
  sr_send('NPC', 'npc_hide');
  sr_send('ConditionManager', 'luida_reset', { token: $.state.sr_token });
  sr_phase('settle');
}
function sr_tick(dt) {
  const phase = $.state.sr_phase || 'idle';
  if (phase === 'idle') return;
  $.state.sr_phaseSec = ($.state.sr_phaseSec || 0) + dt;
  $.state.sr_pollIn = ($.state.sr_pollIn || 0) - dt;
  if ($.state.sr_pollIn > 0) return;
  $.state.sr_pollIn = SR_POLL_SEC;
  if (phase === 'end') {
    if ($.getStateCompat('global', 'state_currentID', 'integer') !== SR_END_ID) return;
    if ($.state.sr_phaseSec < SR_MIN_END_SEC) return;
    if (!sr_prevGone() || !sr_someoneHere()) return;
    sr_startReset();
  } else if (phase === 'settle') {
    const acked = $.groupState.luida_resetAck === $.state.sr_token;
    if (acked && sr_globalsReset()) {
      sr_phase('pm');
      sr_send('ParticipantManager', 'luida_reset', { token: $.state.sr_token });
      return;
    }
    if (sr_due()) {
      if (!sr_globalsReset()) $.sendSignalCompat('this', 'exp_sessionReset');
      if (!acked) sr_send('ConditionManager', 'luida_reset', { token: $.state.sr_token });
    }
    if ($.state.sr_phaseSec >= SR_ALERT_SEC) sr_status({ error: 'reset' });
  } else if (phase === 'pm') {
    if ($.state.sr_pmAck) { $.log('[SessionReset] done; ParticipantManager reset acknowledged'); sr_idle(); return; }
    if (sr_due()) sr_send('ParticipantManager', 'luida_reset', { token: $.state.sr_token });
    if ($.state.sr_phaseSec >= SR_ALERT_SEC) sr_status({ error: 'reset' });
  }
}
$.onReceive((messageType, arg) => {
  if (messageType === 'luida_reset_ack' && arg && arg.token === $.state.sr_token) {
    $.state.sr_pmAck = true;
    $.log('[SessionReset] ParticipantManager reset acknowledged, new sID=' + arg.sessionID);
  }
});
```
- `sr_prevGone()` は `PARTICIPANTS[1]` が **存在してかつ退室済み** のときだけ true（保守的）。`reset` で `participants = []` にするのは判定の後。
- `settle` / `pm` はタイムアウトで進まない。止まった後も 0.5 s ごとに再判定・再送するので、遅れて応答が来れば先へ進む。
- `pm` の終わり方は 2 通り: `luida_reset_ack`（`sr_pmAck`）か、Start の `sr_idle()`。後者は PM の初期化は済んだが ack が先に失われた場合で、Start が来た時点で初期化済みなのは確か（§2 性質）。`idle` 中に遅れて届いた ack は `sr_pmAck` を立てるだけで、次の `sr_startReset()` が false に戻すので無害。

#### 3.2.2 `exp_sessionReset` → Global 書き込み（GlobalLogic ×5）
既存の `AddSignalRelay(go, item, key)`（`ResetGlobalBool` テンプレートを `EditorUtility.CopySerialized` で複製し、`LuidaFakeGimmick.PatchStatementAtSignal` で書き換え）を一般化した `AddGlobalWrite(go, item, triggerKey, targetKey, paramType, value)` を追加し、同じトリガ `exp_sessionReset` で 5 個付ける（1 GameObject に同じキーの GlobalLogic を複数置くのは `LuidaDataCollectionGimmick` が既にやっている）。設置メニューでは SessionReset 上の既存 GlobalLogic をいったん全部外してから付け直す（冪等）。

| 書き込み先（Global） | 型 | 値 | ヘルパ |
|---|---|---|---|
| `state_exited` | Signal | — | `PatchStatementAtSignal(logic, 0, "state_exited")` |
| `state_currentID` | Integer | 0 | `PatchStatementAt(logic, 0, "state_currentID", 3, 0)` |
| `exp_trialID` | Integer | 0 | `PatchStatementAt(..., 3, 0)` |
| `exp_readyToLeaveTrials` | Bool | false | `PatchStatementAt(..., 1, false)` |
| `exp_arePlayersEnough` | Bool | false | `PatchStatementAt(..., 1, false)` |

`state_entered` は **出さない**（PM の `exp_StartStateTransition` が 1 人目と同じ経路で出す）。`settle` で 4 値を読んで確認する（Signal は確認不要: Transition の `state_isActive` は `state_entered` のときに `state_currentID` から計算し直される）。

#### 3.2.3 `ExitPortal`: 足元ゲート → 遠方ゲートへテレポート
`ParticipantManager.js` の拒否処理（`REJECTION_GATE_POS = (-100, 100, -100)` にゲートを置き、`player.setPosition(ゲート + 0.5 up)`）と同じ方式。ゲートの位置は実行時にスクリプトが決める（現行の `ep_update()` と同じ。§1.9）ので、`ApplyLayout` は変えない。

```js
const EP_DELAY_SEC = 10;
const EP_GATE_OFFSET = new Vector3(100, 100, 100);   // item-local; far from the spawn point (PM's rejection gate is at (-100,100,-100))
function ep_begin() { $.state.ep_startTs = Date.now(); $.state.ep_shown = false; }
function ep_update() {
  if ($.state.ep_shown) return;
  if (Date.now() - ($.state.ep_startTs || Date.now()) < EP_DELAY_SEC * 1000) return;
  const gate = $.subNode('WorldGateToLuidaBar');
  if (!gate) return;
  gate.setPosition(EP_GATE_OFFSET);
  gate.setEnabled(true);
  $.state.ep_shown = true;
  const p = PARTICIPANTS[1];
  if (p && p.exists()) {
    p.setPosition($.getPosition().add(EP_GATE_OFFSET.clone().applyQuaternion($.getRotation())).add(new Vector3(0, 0.5, 0)));
    $.log('[ExitPortal] participant teleported to the exit gate');
  } else {
    $.log('[ExitPortal] gate shown (participant not found)');
  }
}
```
- 念のため **駐車位置も遠方にする**: 設置メニューの `ParkExitGate()` が `ExitPortal/WorldGateToLuidaBar` の localPosition を `EP_GATE_OFFSET` にする（この 1 Transform だけ。`ApplyLayout` 全体は呼ばない）。`ApplyLayout` の該当行（L609–613）も同じ値にそろえる。
- ゲートは Start の `Hide child` で消える（既存）。指示板の文言「あと N 秒で募集ワールドへ移動します」はそのまま。`IMPLEMENTATION_NOTES.md` §2-9 と builder の `EndGateDelaySec` 付近のコメントを更新。

#### 3.2.4 `Instruction` の End 中: 待機・エラー表示
`ins_endTick()` を「表示すべき文言を決めて、変わったときだけ `ins_show`」に組み替える。CM グループの `luida_resetStatus`（§3.2.1）と `PARTICIPANTS[1]` を見る。

| 条件（上から優先） | 文言 |
|---|---|
| `luida_resetStatus.error` | 「エラー: 実験の初期化に失敗しました。実験者にご連絡ください。」 |
| `PARTICIPANTS[1]` が無い／退室済み | 「しばらくお待ちください…」（次の参加者が入室してから Start までの 1〜3 s） |
| それ以外 | 現行のカウントダウン |

#### 3.2.5 メニューと再生成経路
- `UpdateItemBehaviours()` を `UpdateItemBehaviours(string[] only = null, bool rewriteCollector = true)` に分け、メニュー「Update item behaviours (keep scene)」は従来どおり全件。`defs` に `("SessionReset", SessionResetListeners, SessionResetHandlers, SessionResetLegacy)` を追加。
- 新メニュー `LUIDA > Study4 > Add session reset item (keep scene)`（設置専用・冪等。**SessionReset と、この変更で振る舞いが変わる ExitPortal / Instruction だけ** を書き換え、DataCollector の生成コードや他の 5 アイテムには触れない）:
  1. `SessionReset` が無ければ `CreateSli` → `AddItemGroupMember` → 位置。
  2. `AddWorldItemReference` ×3（既存 id は上書き）。
  3. SessionReset 上の GlobalLogic を全部外して `AddGlobalWrite` ×5。
  4. `ParkExitGate()`。
  5. `UpdateItemBehaviours(new[] { "SessionReset", "ExitPortal", "Instruction" }, rewriteCollector: false)` → `CombineAll()`（LUIDA 本体の .js 変更を結合済みプレハブに反映するため必要）→ シーンを dirty に。
  2 回目以降の実行で変わるのは結合済みスクリプトだけ（テスト I1）。
- **JS の生成も `only` の 3 アイテムに限定する**（レビュー 3 の指摘 3）。`ItemsManagerAssetUtil.ApplyAssetsToScripts(tab)` は `tab.stateListeningItems` の全件について private の `SaveItemToAsset` を呼び、`.js` を書き直す（`ItemsManagerAssetUtil.cs` L415–429）。`UpdateItemBehaviours(only, …)` では `RefreshStateListeningItems(tab)` の後、`ApplyAssetsToScripts(tab)` の前に `tab.stateListeningItems` を `only` の 3 個に絞る（`stateListenersByItem` は全件のまま）。この `tab` は builder が `CreateInstance` して直後に破棄する使い捨てなので、絞っても LUIDA の設定ウィンドウには影響しない。`only == null`（従来メニュー）は全件のまま。LUIDA 側の Editor コードは変えない（絞り込みが効かないと分かったときの代案は、`ItemsManagerAssetUtil` に対象アイテムを受け取る `ApplyAssetsToScripts(editor, items)` を足すこと）。
  - 注: LUIDA の設定ウィンドウ自身は、フォーカスを失ったときと再生開始時に全件を再生成する（`ItemsManagerConfigTab.cs` L107, L117）。限定はこのメニューの差分を 3 アイテムに閉じるためのもので、他の経路の再生成は従来どおり。
- `BuildStateListeningItems()`（フルビルド）にも SessionReset の生成と `ParkExitGate()` を追加。ユーザは手編集を続けているので、フルビルドは使わない（memory の方針どおり）。

### 3.3 変更しないもの
- `CustomDataUploader.js`（§3.1.4）、`StateLogger.js`（`state_currentID` の変化で `stateLog` を書き直す）。
- `NpcController.js`（`npc_hide` で待機状態に戻る。`npc_rest` のキャッシュは同じモデルなので保持してよい）。
- Study4Button.js、AvatarGate / DeviceCheck / ReportPanel / MirrorPanel / NpcDirector: Start のリスナーが毎回初期化する。
- `ApplyLayout`（ゲート駐車位置の 1 行以外）、DataCollector の生成コード、Web Console、バックエンド。

---

## 4. リセットで戻るものの一覧（誰が戻すか）

| 状態 | 場所 | 戻す主体 | 確認 |
|---|---|---|---|
| `state_currentID`(=11), 各 Transition の `state_isActive` | CCK Global / Item | GlobalLogic（`state_exited`, `state_currentID = 0`）、その後 PM の `state_entered` | `settle` が Global を読む |
| `exp_trialID`, `exp_readyToLeaveTrials`, `exp_arePlayersEnough` | CCK Global | GlobalLogic | 同上 |
| `exp_showWaitingMessage` | PM アイテム | PM（`luida_reset`） | `luida_reset_ack` |
| `sessionID`, `participants`, `isParticipantsEnough`, `qCompletedCount` | PM グループ | PM | 同上 |
| `eligibleCount`, `participantsEnvInfo`, `idfc2userId`, `isSessionApproved`, `existingConditions`, 拒否キュー | PM `$.state` | PM | 同上 |
| `isLast`, `trialID`, 参加者内条件表, `betweenSubjectsConditions`, `currentCondition`, `stateNames` | CM `$.state` / CM グループ | CM（`luida_reset` → `reset()`） | `luida_resetAck == token` |
| `participants`, `collectedData`（CM グループ側） | CM グループ | SessionReset（`reset`） | — |
| `sessionID`（CM グループ側のコピー） | CM グループ | PM → CM `luida_participants_info`（P2 の登録時、1 人目と同じ） | — |
| 送信バッファ `customData` | DataCollector | 現行どおり発行時に空（リセットでは触らない） | — |
| 質問紙の `participant`, `isParticipantAssigned`, `isInitiated`, `isSubmitted`, `answers`, `form_show_start_hint` | 各 FormController | FormController 自身（sessionID 変化） | — |
| NPC の表示・フェーズ | NPC `$.state` | `npc_hide` | — |
| 指示板・パネル・ボタン・鏡・ゲート | 各 SLI `$.state` / 子ノード | 各 SLI の Start リスナー | — |
| 参加者の移動速度 | Player | NpcDirector `nd_tick`（登録後 1 s 以内に 0） | — |
| 2 人目の PlayerScript, 質問紙のプレイヤーローカル UI | Player | PM の `setPlayerScript`（登録時）／プレイヤーローカルなので新規 | — |
| `luida_resetStatus`, `luida_resetAck` | CM グループ | SessionReset / CM（次のリセットで上書き。Start で `idle` に） | — |

---

## 5. 実装手順（チェックリスト）

1. LUIDA 本体 3 ファイル（§3.1.1〜3.1.3）を編集。別コミット（テンプレートへの上流化を想定）。
2. builder（§3.2）: `AddGlobalWrite`、`SessionResetListeners/Handlers/Legacy`、`ExitPortalLegacy` の差し替え、`ParkExitGate`、`Instruction` の End 文言、`UpdateItemBehaviours(only, rewriteCollector)`（リスナー更新と JS 生成の両方を `only` に限定）、`defs` と `BuildStateListeningItems` への追加、メニュー `Add session reset item (keep scene)`。
3. SessionReset の `sr_tick` を Node でモックして確認（M1）。
4. Unity（開いているエディタ、Unity MCP `execute_menu_item`）で `LUIDA > Study4 > Add session reset item (keep scene)` を実行 → コンソールにエラーがないことを確認 → シーン保存。`refresh_unity` でコンパイルを通す。もう一度実行して差分が結合済みスクリプトだけであることを確認（I1）。
5. エディタで通常の 1 周（回帰）: SessionReset が発火しないこと（参加者がいる間は `sr_prevGone()` が false）。End でテレポート退出が機能すること（CSEmulator では WorldGate の遷移は再現されないので、位置が (100,100,100) 付近に飛ぶことだけ確認）。
6. テストワールドへアップロード → §6 の実機テスト。
7. `IMPLEMENTATION_NOTES.md` に §「セッションリセット」と End の変更を追記。

---

## 6. テスト

### 6.1 モック（Node、`$` を差し替え）

| ID | 内容 | 期待 |
|---|---|---|
| M1 | SessionReset `sr_tick`: `end` の 4 条件（End 以外／5 s 未満／P1 在室／誰もいない）で発火しない、`settle` で Global 未反映や ack 無しのとき 2 s ごとに再送して進まない、`pm` で ack 無しのとき進まない、ack の token 不一致を無視、15 s でエラー状態、遅れて ack が来れば進む、Start の `sr_idle()` が ack より先に来ても `pm` を終える（その後の ack は無害） | 設計どおり。タイムアウトで進む分岐が無い |
| M2 | PM / CM の `luida_reset` ハンドラ: `initSession()` / `reset()` の途中で例外を投げる → 同じ token を再送 → 正常 | 1 回目は token 未保存・ack 無し（PM は `isParticipantsEnough` が true のまま）。再送で初期化が再実行され ack。同じ token の 3 回目は初期化せず ack のみ |

### 6.2 実機（Cluster テストスペース。エディタでは退室／再入室を再現できない）

| ID | 手順 | 期待 |
|---|---|---|
| R1 | アカウント A で最後まで実施 → End の 10 s 後に募集ワールドへ戻る → 数分以内にアカウント B（または同じ A）で入室 | B は 1〜3 s で Start（同意質問紙のヒントが見える、NPC 非表示、移動凍結）。ログ順: `[SessionReset] previous participant left…` → `[ConditionManager] session reset` → `LUIDA session reset: new sID=…` → `Participants are enough…`。`…acknowledged` / `…done` は `LUIDA session reset` より後なら `Participants are enough…` の前後どちらでもよい（ack は完了通知。§2） |
| R2 | R1 の続きで B も最後まで実施 | Web Console: セッションが 2 件（別 sID）、カスタムデータが 2 セッション分、質問紙回答が 2 人分。B の参加者間条件が A の条件を考慮して割り付けられている（`existingConditions` に A が含まれる） |
| R3 | A が End 直後（カウントダウン中）にメニューから退出 → B 入室 | B 入室後、まず A の行が旧 sID で発行され（`Upload data step` のログ、`sID` が A のもの）、その後リセット。A のデータが Web Console にある |
| R4 | B のスポーン直後にゲートに触れないこと | 旧実装のように即座に送り返されない。B 入室の 1〜3 s は指示板が「しばらくお待ちください…」 |
| R5 | 2 周目の試行ループ | 4 試行回ってから SocialPresence に進む（`exp_readyToLeaveTrials` / `isLast` の両方が戻っている） |
| R6 | 同じインスタンスで 3 人目 | 同様に動く（リセットは何度でも可能） |
| R7 | **リセットの不達**: テスト用に SessionReset の `ConditionManager` 参照を外してアップロード → R1 | `settle` で 2 s ごとに再送ログ、15 s でエラー表示、B は登録されない（End のまま）。参照を戻せば R1 どおり |

### 6.3 エディタ・静的

| ID | 内容 | 期待 |
|---|---|---|
| I1 | `Add session reset item (keep scene)` を 2 回実行し `git diff --stat` | 1 回目の差分は SessionReset / ExitPortal / Instruction の `.js` と `StateListeners/*.asset`、シーン、結合済みスクリプトに限られる（他 5 アイテム NpcDirector / AvatarGate / DeviceCheck / ReportPanel / MirrorPanel の `.js` と DataCollector 設定は不変）。2 回目の差分は結合済みスクリプト（`Scripts/StateManagement/PhantomTouch/*`, LUIDA プレハブ）だけ |
| I2 | SessionReset の無い LUIDA シーン（テンプレートのサンプル）でプレイ | `luida_reset` 系のログが一切出ない。`sessionID` は一定なので FormController の自己初期化は走らない |

---

## 7. 対象外: 途中離脱（End 前の退室）への対応

同じ `SessionReset` に「End 以外のステートで `PARTICIPANTS[1].exists()` が false のまま、誰かが入室している」場合のリセットを加えることはできるが、離脱時点の部分データの扱いとキャンセル処理が別途要る。**本実装の範囲外**。完了済み実験のリセットが実機で安定してから別計画で扱う。

---

## 8. リスク・未確認事項・判断

- **送信成功は確認しない（判断: 2026-11-06）。** リセットは End の送信が **発行された** ことまでしか保証しない（5 s ガード）。本実験の送信データは小さく、一般的な回線なら 10 秒で送信は終わる。10 秒で送れない回線ではセッション自体が正常に進行していない可能性が高く、得られても廃棄されうる。送信完了の追跡・再送・バックエンドの応答確認は `upload-reliability-plan.md` に退避し、後で扱う。
- **100 KB 超の既存問題**（リセットと無関係）: 現行の分割送信は壊れており、End の送信が 100 KB を超えるとデータが消える（`upload-reliability-plan.md` §1.3）。Study 4 の trace 付き行は最大 90 KB 前後になりうる。実データの行サイズを早めに測ること。
- **空のスペースの存続時間と状態保持**: 公式ドキュメントで確認できなかった。すぐ閉じる場合はこの機能が使われないだけで害はない。R1 で「退室から N 分後に再入室」を何通りか試して記録する。
- **次の参加者が同じインスタンスに入るか**は Cluster 側の振り分け次第。入らなければ新規スペース（従来どおり `$.onStart`）。
- **止まったインスタンス**: `settle` / `pm` で止まると、そのインスタンスは閉じるまで次の参加者を受け入れない（2 人目は指示板のエラーを見て退室）。状態の初期化に失敗したまま登録するよりよい。
- **CCK Global 書き込みの反映遅延**: ネットワーク経由なので `settle` で 4 値を読んで確認し、未反映なら 2 s ごとに信号を再送する。Start のリスナーは冪等（表示／非表示の設定のみ）なので、万一 `state_entered` が 2 回来ても問題ない。
- **入室直後の移動**: `OnJoinPlayerTrigger` が `exp_arePlayersEnough`（リセット前は true）を見て移動速度 1 にするので、登録されるまでの 1〜3 s は歩ける。NpcDirector の `nd_tick` が登録後 1 s 以内に 0 に戻す。実害なし。
- **スクリプト再ロードで消える `let` 変数**（`rp_queue`, `traceBuf`, 基底の `timer`）: 入室時にオーナーが変わって再ロードされるが、End 中に残っている値はない。SessionReset の phase は `$.state` に持つ。
- **サブノードの状態の保持**: ゲートの「有効」が保持され「位置」だけシーン既定に戻る、という未記載の挙動があっても、駐車位置を遠方にしているのでスポーン地点には現れない（R4）。
- **ファイル名の衝突**: `uploadCustomData` は `sID` 単位で保存されるので新 sID なら衝突しない。
- **LUIDA 本体の差分**: 3 ファイル。PM 約 40 行（うち 20 行は `onStart` の中身の移動）、CM 約 15 行、Form 約 12 行。既存の呼び出し経路は変えない。

---

## 9. 改訂履歴とレビュー対応

### 改訂 3.1（2026-11-07、3 回目のレビュー）— 範囲は変えず 3 点を修正
レビュワーの確認済み事項: 通常のフェーズ遷移、Global・CM 未確認時の停止、異なる token の無視、遅れた ack での再開（Node モック）。送信確認・再送を必須に戻す必要はない。
| # | 指摘 | 判断 | 反映 |
|---|---|---|---|
| 1 | PM・CM が初期化の前に token を保存するので、途中で例外が出ると再送時に初期化を飛ばして ack を返す（CM のモックで再現） | 同意 | §3.1.1, §3.1.2: token は初期化完了後に保存。PM の `isParticipantsEnough = false` を `initSession()` の最後へ。M2 |
| 2 | 「PM の ack を受け取るまで登録されない」は実装と不一致。登録は `initSession()` 完了で再開し、Start の `sr_idle()` でも待機は終わる | 同意。保証は「Global・CM の確認後、PM の初期化完了で登録を再開する。ack は完了通知」と改める | §0, §2, §3.2.1 のコメントと注記, M1, R1 |
| 3 | `only` をリスナー更新だけに適用しても `ApplyAssetsToScripts` が全アイテムの JS を書き直す | 同意 | §3.2.5: 使い捨て `tab` の `stateListeningItems` を 3 個に絞ってから生成。I1 の期待値 |

### 改訂 3（2026-11-06）: 範囲の確定
- ユーザの判断: 送信完了・失敗・再送の設計のやり直し（改訂 2 の §3.1.4 ほか、約 250 行・LUIDA 全体に影響）は後回しにし、先に「次の参加者が実験を最初から始められる」機能を進める。レビュワーも同意。
- 範囲: 現行の送信処理と 10 秒待機を維持（完了追跡・再送・警告行は見送り）。End 到達・5 s 経過・前参加者の退出を条件にリセット。新しい sessionID、条件管理、質問紙、表示物の初期化。退出ゲートの修正。**リセット自体の完了確認は残す。**
- 完了条件: 「現行の送信処理を維持し、同一インスタンスで次の参加者が正常に実験を開始・完了できること」。
- 退避: 改訂 2 の送信確認の設計と関連の事実・テストは `upload-reliability-plan.md` に移動。

### 改訂 2（2026-11-06、2 回目のレビュー）— 判断は維持、実装は後回し
| # | 指摘 | 判断 |
|---|---|---|
| 1 | 「バックエンド障害時は P2 が登録されない」はコードと逆（PM は失敗を参加可能として進める）。既定は `block` | 同意。改訂 1 の主張を撤回 |
| 2 | `proceed` しても `inflight` が残り P2 の送信が詰まる | 同意（退避した設計で対応） |
| 3 | 警告行が保存済みデータを置き換える | 同意。警告行は撤回 |
| 4 | 応答時の行削除は現行の分割と両立しない。既存ワールドにも影響 | 同意（退避した設計で対応。現行の分割自体が壊れていることも確認） |
| 5 | 「End 到達＝DataCollector 以外は保存成功」ではない | 同意（退避した設計で対応） |
| — | 送信状況が無ければ成功扱いする分岐を撤去 | 同意（今回は送信状況を見ないので該当なし） |

### 改訂 1（2026-11-06、1 回目のレビュー）
| # | 指摘 | 判断 | 反映 |
|---|---|---|---|
| 1 | 5 s では送信の成功が確認できない | 同意。5 s は発行の保証（改訂 3 で、成功の確認は範囲外と判断） | §1.6, §8 |
| 2 | 設置メニューがゲートをスポーンに残す | 旧案（`ApplyLayout` で遠方配置）には当たっていた。実行時の `gate.setPosition()` を明記して解消。駐車位置も遠方にする安全策を採用 | §3.2.3: `ParkExitGate()` |
| 3 | 失敗してもタイムアウトで進んでしまう | 同意 | 各フェーズに確認、token で冪等な再送、`settle`/`pm` は進まない、指示板にエラー表示 |
| 4 | keep-scene メニューが無関係なアイテムを書き換える | 同意 | `UpdateItemBehaviours(only, rewriteCollector)` |
| — | §7 は対象外に / 検証の拡張 | 同意 | §7、§6 |

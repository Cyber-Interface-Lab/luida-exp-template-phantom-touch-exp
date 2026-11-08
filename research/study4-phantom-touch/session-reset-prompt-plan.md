# 新しく入った人に確認してからセッションをリセットする 実装計画

- 作成日: 2026-11-08（`session-reset-plan.md` 改訂 3.1 の実装を受けた方針転換）
- **実装: 2026-11-08**（§7 の判断: (a) 捨てる、(b) 「いいえ（続きから）」を付け、同じアカウントで入り直した人にだけ出して前の枠に結び直す（§3.1.5）、(c) 後片付けと §3.5 を実施、(d) 一回限りのスクリプト、(e) 文言は `NR_TEXT_*` のまま、(f) シーンの旧アイテムは MCP で削除。実装メモは `IMPLEMENTATION_NOTES.md` §8。実機テスト §6.3 は未実施）
- 対象: LUIDA テンプレート `Assets/ClusterMetaverseLab/LuidaExpTemplate/`（Study 4 のシーン `Assets/_Experiment_/Scenes/PhantomTouch.unity` で使う）
- 関連: `session-reset-plan.md`（前の設計。確認した事実 §1 はそのまま有効）, `IMPLEMENTATION_NOTES.md` §8（前の実装）, `upload-reliability-plan.md`
- 根拠はファイルパス付きで示す。Cluster の仕様は `Assets/Doc/CCK-Types.d.ts`（2026-11-08 参照）。

---

## 0. 結論と範囲

**要望**: 進行中（または終了済み）のセッションのインスタンスに、元の参加者がいなくなった後で誰かが入ってきたら、その人の目の前で「あなたは新しく入った参加者ですか？」と聞き、「はい」が押されたときだけインスタンスの状態をすべてリセットする。End まで行っていなくても（途中離脱でも）同じ。自動ではリセットしない。

**方針**: いまシーン側にある `SessionReset` アイテム（End 後に自動でリセット）をやめ、同じ役目を **LUIDA 本体の ParticipantManager（PM）** に持たせる。PM はすでに 1 秒ごとに在室プレイヤーを見ていて（`ParticipantManager.js` L55–69）、ConditionManager（CM）への参照を持ち（`HandleParticipantsEnough`）、PM 自身がリセットの最後の段階なので、PM に置くと前の設計で別アイテムから PM へ送っていた `luida_reset` の往復が要らなくなる。

変更の規模:

| 場所 | 変更 | 量 |
|---|---|---|
| `Runtime/Scripts/ParticipantHandler/ParticipantManager.js` | 新規参加者の検出、確認パネルの表示、「はい」でのリセット進行（前の `SessionReset` の `sr_*` を移植して簡略化） | 約 110 行追加。既存の経路は変えない |
| `Runtime/Scripts/ConditionManagement/ConditionManager.js` | `luida_reset` の応答を送信元に返信、CM グループの `participants` / `collectedData` を空にする | 4 行 |
| `Runtime/Scripts/CustomDataCollection/CustomDataUploader.js` | セッション（CM グループの `sessionID`）が変わったら未送信バッファを捨てる | 約 8 行 |
| `Runtime/Prefabs/ParticipantManager.prefab` | 確認パネル（サブノード 3 つ）と、Global を戻す GlobalLogic 5 個 | エディタで組み込み（§3.2） |
| シーン `PhantomTouch.unity` | 旧 `SessionReset` アイテムを削除 | 1 オブジェクト（ユーザ操作） |
| `Assets/_Experiment_/`（任意） | 旧 SessionReset の生成コードと生成物の削除。途中離脱後に見た目を整える 2 行 | §3.4, §3.5。やらなくても動く |

**変わらないもの**: PM の登録・eligibility・条件均衡、CM の条件管理、質問紙の sessionID 連動の初期化（`FormController.js`、2026-11-07）、End の退出（ExitPortal の遠方ゲートへのテレポート）、送信処理（`upload-reliability-plan.md` は後回しのまま）、バックエンド。

**前の設計から引き継ぐ性質**: リセットの各段階は確認してから進み、タイムアウトでは進まない。PM の初期化が最後で、それまで次の人は登録されない。送信成功は確認しない（判断 2026-11-06）。

---

## 1. 確認した事実（新しく確認したものだけ。前の計画 §1 に追加）

### 1.1 Cluster の仕様（`Assets/Doc/CCK-Types.d.ts`）
- `PlayerHandle.id`: 「空間内のプレイヤーを一意に表す ID。**同じユーザーでも入室ごとに異なります**」（L2376–2381）。→ 同じアカウントで入り直した人も「新しい入室」として見分けられる。`idfc` はアカウントごとに一定（L2397–2407）。
- `PlayerHandle.exists()`: 入室中なら true、退室済みなら false。通信不具合で一時的に非表示でも true（L2415–2420）。
- `$.onInteract(callback)`: 「掴めないアイテムに『使う』動作をした際に呼ばれる。アイテムには 1 つ以上の Collider が必要。**トップレベルでの呼び出しのみ**」（L246–267）。どのコライダーが押されたかは分からない（プレイヤーだけ渡る）。→ ボタンは 1 アイテムに 1 つ。LUIDA の質問紙も同じ方式（`FormController.js` L77, `FormNextButton.js` L1）で、VR で動いている。
- `SubNode.setPosition(pos)`: **アイテムのローカル座標**。「ネットワークを介して補間して同期されるため、即座に反映されない場合がある」（L1636–1642）。`setRotation` も同様。→ 非表示のまま動かして、次のポーリングで表示する。
- `SubNode.setText(text)`: TextView の文字列を設定（1 kB まで。L1724–1734）。
- `PlayerHandle.getPosition()` / `getRotation()`（L2539–2544）、`getHumanoidBonePosition(HumanoidBone.Head)`（L2669。null のことがある）。`Quaternion.invert()`（L3124）、`Vector3.applyQuaternion` / `add`（builder の ExitPortal で使用済み）。
- Player Local UI の Button（`UnityComponent.onClick`, L6163–6174）も使えるが、LUIDA の質問紙は VR で確実に動く「ワールドのコライダー + `$.onInteract`」を使っている。今回も同じにする（PlayerScript を入室直後の未登録プレイヤーに付ける手間も要らない）。

### 1.2 ParticipantManager（`Runtime/Prefabs/ParticipantManager.prefab`, `ParticipantManager.js`）
- プレハブ: ルート `ParticipantManager`（Item, ScriptableItem, PlayerScript, ItemGroupHost, WorldItemReferenceList に `ConditionManager`, OnCreateItemTrigger → `exp_arePlayersEnough = false` など, GlobalLogic `exp_playersAreEnough` → `exp_arePlayersEnough = true`, PlayerLogic）。子 `WaitingMessage`（Quad + `SetGameObjectActiveGimmick(exp_showWaitingMessage)` + 子 `Text` に CCK TextView。ローカル (0, 1.5, 2)、スケール (3, 0.75, 1)）、子 `WorldGateToLuidaBar`。**コライダーは無い**（→ `$.onInteract` を付けても、押せるのは新しく付ける「はい」だけ）。
- `LUIDA-ExpManagers.prefab` の中で PM はローカル (0, 0, −2)・無回転。PhantomTouch では ExpManagers も無回転なので、PM はスポーン地点 (0, 0, −2) にあり、`WaitingMessage` はその 2 m 前（+Z）にある。
- `$.onUpdate`: `!isParticipantsEnough` のときだけ 1 秒ごとに未登録の在室プレイヤーを登録する（L56–69）。**`isParticipantsEnough` が true の間（セッション進行中・終了後）は在室者を見ていない**。→ ここに「元の参加者が誰もいない ∧ 未登録の人がいる」の検出を足す。
- `luida_reset` ハンドラ（L191–204）と `initSession()`（L35–53）は 2026-11-07 の実装のまま使える。`initSession()` の最後の `isParticipantsEnough = false` で登録が再開する。

### 1.3 ConditionManager（`ConditionManager.js` L58–74）
- `luida_reset` は token で冪等、完了を CM グループの `$.groupState.luida_resetAck` に書く。`sender` を受け取っているので `sender.send()` で返信できる（PM が自分の ack でやっている形）。
- CM グループの `participants` / `collectedData` を空にしていたのは旧 `SessionReset`（CM グループのメンバー）。PM は別グループなので書けない → CM のハンドラに移す。

### 1.4 データ収集（`CustomDataUploader.js`）
- 未送信の行は `$.state.customData`（DataCollector 私有）。送信時に `sID = $.groupState.sessionID`（CM グループのコピー。`luida_participants_info` で PM から届く。P2 の `HandleParticipantsEnough` で変わる）を付ける（L91–113）。
- → 途中離脱した P1 の未送信行が残ったまま P2 が始まると、**P1 の行が P2 の sID で送られる**。前の設計は End 後のみだったので問題にならなかった（End の送信でバッファが空になる）。今回は途中離脱も対象なので対処が要る（§3.1.3、判断 §7-a）。

### 1.5 Study 4 のシーン（`Assets/_Experiment_/`）
- 旧 `SessionReset` は `StateListeningItem.prefab` のインスタンス（名前はプレハブ上書き `value: SessionReset`、シーンに 2 箇所。`exp_sessionReset` の GlobalLogic 5 個を含む 7 箇所）。生成物 `Scripts/StateManagement/PhantomTouch/SessionReset.js`、`StateListeners/SessionReset.asset`。builder の `InstallSessionReset` / `AddSessionResetItem` / `SessionReset*`（L150, L189–221, L1579–1580, L2513–2665）。
- 旧アイテムを **残したままだと End 後に自動でリセットしてしまう** ので、必ず外す。
- 途中のステートからリセットしたときに Start のリスナーが元に戻さないもの: NPC（NpcDirector の S_START は `ShowItem` + `nd_setMove(0)` だけ。L1892。NPC は Trial - Start の 0.5 s 後の `npc_hide` で消える）、鏡（MirrorPanel は Trial - Touch の終了でしか `Mirror` を隠さない。L2456–2461）。身長合わせの台は `npc_hide` → `resetHeights()` で下がる（`NpcController.js` L327–331）。報告パネル・着替え指示・機器確認は S_START で隠す（L1995, L2179, L2259）。質問紙のコンテナは `state_exited` で非表示になる。
- Instruction の End 文言は CM グループの `luida_resetStatus` を見ている（L1862–1864）。PM からは書けないので、この分岐は使われなくなる（エラーは確認パネルに出す）。前の参加者がいないときの「しばらくお待ちください…」はそのまま。

### 1.6 途中のステートからリセットしたとき、動き続けるもの（2026-11-08 に確認。影響の有無）
- **Exit Time のタイマー**（Greeting 30 s、Rest 1 s。`StateTransition.prefab` の ItemTimer、`StateMachineConfigTab.cs` L675–696 が `state_enter` で起動するように設定）: 満了時に `state_tryTryTriggerTransition` → ItemLogic が **`state_isActive` のときだけ** `state_tryTriggerTransition` を出す（prefab L883–894）。リセットで全 Transition の `state_isActive` が false になるので、残ったタイマーが満了しても遷移しない。rep=2 で Greeting を即座に抜けたあと 30 s 後に遷移しないのと同じ仕組み。→ 影響なし。
- **`ToNextState()`**（Global 信号 `state_triggerTransition`）: 到着時に `state_isActive` を見て、0.2 s 後に `state_tryTriggerTransition`（再確認なし。prefab L1079–1090, L1206–1217）。リセットの直前 0.2 s 以内に出た ToNextState だけがリセット後に遷移しうる。「はい」と同じ瞬間に前のセッションの ToNextState が出る必要があるので、無視できる。
- **`Trial - Rest` の `exp_trialID += 1`** は Rest アイテム自身の `state_triggerTransition` の連鎖（`Trial - Rest State.prefab` statements[1]）。リセットが出す Global `state_exited` では増えない。→ 影響なし。
- **SLI の exit アクション**は `last_state_id`（`state_enter` 時にキャッシュ）で実行される（`StateListeningItemBase.js` L22–27, L197–215）ので、`state_currentID` が先に 0 になっていても途中ステートの exit が正しく走る。Global `state_exited` → 各 SLI の `state_exit` は `StateListeningItem.prefab` L196–202 で全 SLI 共通。
- **SLI の during アクションは `state_enter` が来るまで止まらない**（`DuringState` は毎フレーム index を 0 に戻し、exit では −1 にしない）。リセットから Start までの数秒、途中ステートの during（Touch の `nd_donePulse()`／120 s タイムアウト、Report の `rp_update`、PoseCheck の `dc_update` など）が動き続ける。`ToNextState()` は `state_isActive=false` で無効、残りは表示物の更新で、Start の enter で上書きされる。→ 実害なし（通常の遷移でも exit→enter の間は同じ）。
- **NpcController の `participant()`**（`NpcController.js` L371–377）は登録参加者が退室済みだと `$.getPlayersNear(50)[0]` にフォールバックする。P1 が Touch の途中で抜けた場合、P2 が入った時点で NPC は **P2 を相手に試行を続ける**（確認パネルを読んでいる間に顔に触れに来る）。今回の変更が原因ではない既存の挙動だが、途中離脱を扱うようになると実際に起きる。→ §3.5 で対処を提案。
- **質問紙の回答ボタン**（`$.createItem`）は `setVisiblePlayers([P1])` で P1 にしか見えない（`FormAnswerOptionUI.js` L27）。P1 が質問紙の途中で抜けても P2 には見えず、次にそのステートに入ったとき `reopenForm()` → `reset(true)` → `destroyAnswerOptionUIs()` が破棄してから開き直す。→ 影響なし。
- **Instruction の OK ボタン**: `ins_okBegin()` が `ins_btn` を 0 にしてから出す（builder L1850）ので、前の人の押下は残らない。ReportPanel / AvatarGate / DeviceCheck も enter で初期化し Start で隠す。
- **CM グループの `participants`**: P1 退室後は（リセットの有無にかかわらず）`PARTICIPANTS[1]` は退室済みハンドル。参照する側（Instruction, ExitPortal, NpcController, `nd_tick`）は `exists()` を見ている。P2 の登録時に PM の `luida_participants_info` で上書きされるので、リセット時に空にする必要はない（旧 SessionReset はやっていたが、やめる。§3.1.2）。
- **CM グループの `collectedData`**（各アイテムが最後に書いた値の寄せ集め。行を作るときに全部混ざる）: P1 の値が残ると P2 の最初の行に混ざる。リセット時（`luida_reset`）に空にすると、同時に走る途中ステートの exit アクションが P1 の値を書き戻す競合がある。→ P2 の登録時（CM が `luida_participants_info` で sessionID を更新する瞬間。exit アクションより確実に後）に空にする（§3.1.2）。
- **データ収集の `exp_uploadCustomData` が届く前に P1 が End で退室した場合**（End 開始から約 1 s 以内。ギミック中継が失われる）: P1 の行は未送信のまま残り、P2 の登録時に捨てられる（§3.1.3）。旧設計では P2 の sID で送られて P2 のデータに混ざっていたので、捨てる方がまし。頻度は低い。

---

## 2. 設計

```
P1 のセッション（進行中 or End）
  P1 退室 → 空のスペース（スクリプト停止、状態は保持）
P2 入室 → スクリプト再開
PM（1 秒ごと。isParticipantsEnough が true の間）
  [idle]    在室者のうち、登録済み participants の id を持つ人が 1 人もいない ∧ 未登録の人がいる → asking
  [asking]  検出から 3 s 後: 確認パネルを P2 の正面 1.2 m・目の高さに置く（非表示のまま移動）→ 次のポーリングで表示
            「あなたは新しく入った参加者ですか？ 新しい参加者の方は「はい」を押してください。」＋「はい」
            P2 が離れたら（> 2 m）置き直す。未登録の人がいなくなったら隠して idle
            ※ 押されるまで何も変えない。登録済みの人が戻ってきても何も変えない
  「はい」（$.onInteract。在室者なら誰でも）
  [settle]  token 発行。自アイテム信号 exp_sessionReset → GlobalLogic ×5:
              state_exited(signal), state_currentID = 0, exp_trialID = 0, exp_readyToLeaveTrials = false, exp_arePlayersEnough = false
            CM.send('luida_reset', {token}) → CM: isLast / 条件 / trialID を戻し、グループの participants / collectedData を空にして返信
            パネル「初期化しています。しばらくお待ちください…」（ボタンなし）
            確認: Global 4 値が戻っている ∧ CM の返信 token が一致 → 完了へ。未確認なら 2 s ごとに再送。15 s 超でパネルにエラー表示。進まない
  [完了]    initSession()（新 sessionID, participants = [], qCompletedCount = 0, …, 最後に isParticipantsEnough = false）
            exp_showWaitingMessage = true。パネルを隠して idle
            → 既存の登録ポーリングが 1 s 以内に P2 を登録 → envInfo → eligibility（新 sID） → HandleParticipantsEnough
            → exp_StartStateTransition → state_entered → Start。質問紙は sessionID の変化で開き直す（既存）
            → DataCollector は CM グループの sessionID の変化で未送信バッファを捨てる（新規）
```

性質:
- **押されない限り何も変わらない。** 実験者が様子を見に入っても、元の参加者が（別の入室として）戻ってきても、押さなければそのまま。途中離脱でも End 後でも同じ流れ。
- **登録は PM の `initSession()` 完了（最後の段階）まで構造上ブロックされる**（前の設計と同じ）。Global と CM を確認してから PM を戻す。
- **同じアカウントの入り直し** は `PlayerHandle.id` が入室ごとに変わるので「未登録の人」として扱われ、確認される。
- **End の送信**: End 開始 1 s 後に発行される。P1 が End 直後に退室した場合でも、P2 入室 → 3 s の表示待ち → 人が読んで押す、の間に旧 sID で発行される（CM グループの sID が変わるのは P2 の登録後）。前の 5 s ガードと同じ目的で、十分長い。
- **誰も押さずに去った** 後は idle に戻り、次に入った人にまた聞く。

---

## 3. 変更一覧

### 3.1 LUIDA 本体（`Runtime/Scripts/`）

#### 3.1.1 `ParticipantHandler/ParticipantManager.js` — 追加のみ
既存の `$.onUpdate` の先頭で `nr_tick(deltaTime)` を呼ぶ。`luida_reset` ハンドラと `initSession()` はそのまま（外部から送られたときの経路として残す）。`$.onReceive` に `luida_reset_ack`（CM からの返信）を足す。パネルのサブノードが無いワールド（既存ワールド）では `nr_node()` が null を返し、確認もリセットも起きない（挙動は従来どおり）。

```js
// ---- 新しく入った人の確認とセッションリセット（2026-11-08） ----
// isParticipantsEnough が true（セッション進行中・終了後）の間、1 秒ごとに在室者を見る。登録済みの参加者が誰もいなくて
// 未登録の人がいれば、その人の正面にパネルを出して新しい参加者かどうかを聞く。「はい」で Global と ConditionManager を
// 戻し（確認してから）、最後に自分（initSession）を戻す。押されるまで何も変えない。タイムアウトでは進まない。
const NR_POLL_SEC = 1;
const NR_PROMPT_DELAY_SEC = 3;   // 検出からパネル表示まで（End の送信が旧 sID で発行される時間。入室直後のアバター位置の安定待ち）
const NR_RESEND_SEC = 2;
const NR_ALERT_SEC = 15;
const NR_DIST = 1.2;             // パネルまでの距離 [m]
const NR_HEIGHT = 1.4;           // 頭ボーンが読めないときの高さ [m]
const NR_REPLACE_DIST = 2;       // 聞いている相手がこれ以上離れたら置き直す [m]
const NR_NODE = "NewParticipantPrompt";
const NR_TEXT = "NewParticipantPromptText";
const NR_YES = "NewParticipantPromptYes";
const NR_TEXT_ASK = "あなたは新しく入った参加者ですか？\n新しい参加者の方は「はい」を押してください。";
const NR_TEXT_BUSY = "初期化しています。\nしばらくお待ちください…";
const NR_TEXT_ERROR = "エラー：実験の初期化に失敗しました。\n実験者にご連絡ください。";

function nr_node(n) { try { return $.subNode(n); } catch (e) { return null; } }
function nr_phase(p) { $.state.nr_phase = p; $.state.nr_phaseSec = 0; $.state.nr_lastSend = -1e9; }
function nr_show(text, withButton) {
  const panel = nr_node(NR_NODE); if (!panel) return;
  nr_node(NR_TEXT)?.setText(text);
  nr_node(NR_YES)?.setEnabled(withButton);
  panel.setEnabled(true); $.state.nr_shown = true;
}
function nr_hide() { nr_node(NR_NODE)?.setEnabled(false); $.state.nr_shown = false; $.state.nr_placed = false; $.state.nr_for = null; }
function nr_place(player) {                     // 相手の正面 NR_DIST、頭の高さ。アイテムのローカル座標で置く
  const pPos = player.getPosition(), pRot = player.getRotation();
  if (!pPos || !pRot) return false;
  let h = NR_HEIGHT;
  if (!isTestMode) { const head = player.getHumanoidBonePosition(HumanoidBone.Head); if (head) h = Math.min(1.8, Math.max(0.9, head.y - pPos.y)); }
  const fwd = new Vector3(0, 0, 1).applyQuaternion(pRot); fwd.y = 0; fwd.normalize();
  const world = pPos.clone().add(fwd.multiplyScalar(NR_DIST)).add(new Vector3(0, h, 0));
  const inv = $.getRotation().clone().invert();
  nr_node(NR_NODE).setPosition(world.clone().sub($.getPosition()).applyQuaternion(inv));
  nr_node(NR_NODE).setRotation(inv.clone().multiply(pRot));   // パネルの +Z = 相手の正面（WaitingMessage と同じ向き）
  $.state.nr_anchor = pPos;
  return true;
}
function nr_far(player) { const a = $.state.nr_anchor, p = player.getPosition(); return !a || !p || p.clone().sub(a).length() > NR_REPLACE_DIST; }
function nr_globalsReset() {
  return $.getStateCompat("global", "state_currentID", "integer") === 0
      && $.getStateCompat("global", "exp_trialID", "integer") === 0
      && $.getStateCompat("global", "exp_readyToLeaveTrials", "boolean") === false
      && $.getStateCompat("global", "exp_arePlayersEnough", "boolean") === false;
}
function nr_sendResets(globals, cm) {
  if (globals) $.sendSignalCompat("this", "exp_sessionReset");            // このプレハブの GlobalLogic ×5
  if (cm) { const h = $.worldItemReference("ConditionManager"); if (h) h.send("luida_reset", { token: $.state.nr_token }); else $.log("[PM] ConditionManager reference missing"); }
  $.state.nr_lastSend = $.state.nr_phaseSec;
}
function nr_startReset(player) {
  $.state.nr_token = ($.groupState.sessionID || "none") + ":" + Date.now();
  $.state.nr_cmAck = null;
  $.log("[PM] new participant confirmed (" + (player && player.idfc) + "); resetting the session, token=" + $.state.nr_token);
  nr_phase("settle");
  nr_sendResets(true, true);
  nr_show(NR_TEXT_BUSY, false);
}
function nr_finishReset() {
  try { initSession(); $.setStateCompat("this", "exp_showWaitingMessage", true); }
  catch (e) { $.log("[PM] initSession failed: " + e); nr_show(NR_TEXT_ERROR, false); return; }   // 次のポーリングで再試行
  $.log("LUIDA session reset: new sID=" + $.groupState.sessionID);
  nr_hide(); nr_phase("idle");
}
function nr_tick(dt) {
  $.state.nr_pollIn = ($.state.nr_pollIn || 0) - dt;
  if ($.state.nr_pollIn > 0) return;
  $.state.nr_pollIn = NR_POLL_SEC;
  const phase = $.state.nr_phase || "idle";
  $.state.nr_phaseSec = ($.state.nr_phaseSec || 0) + NR_POLL_SEC;
  if (phase === "settle") {
    const acked = $.state.nr_cmAck === $.state.nr_token, globals = nr_globalsReset();
    if (acked && globals) { nr_finishReset(); return; }
    if ($.state.nr_phaseSec - $.state.nr_lastSend >= NR_RESEND_SEC) nr_sendResets(!globals, !acked);
    if ($.state.nr_phaseSec >= NR_ALERT_SEC) nr_show(NR_TEXT_ERROR, false);
    return;
  }
  if (!$.groupState.isParticipantsEnough) { if (phase !== "idle") { nr_hide(); nr_phase("idle"); } return; }
  const present = $.getPlayersNear($.getPosition(), Infinity);
  const ids = $.groupState.participants.map(p => p.id);
  // 登録済みの人が残っているか: exists()（通信の不具合で一時的に見えなくても true）か、在室者リストに同じ入室 id がある
  const enrolledHere = $.groupState.participants.some(p => p.exists()) || present.some(q => ids.includes(q.id));
  const strangers = present.filter(q => !ids.includes(q.id));
  if (enrolledHere || strangers.length === 0) { if (phase !== "idle") { nr_hide(); nr_phase("idle"); } return; }
  const s = strangers.find(q => q.id === $.state.nr_for) || strangers[0];
  if (phase === "idle") { nr_phase("asking"); $.state.nr_for = s.id; $.state.nr_placed = false; $.state.nr_shown = false; return; }
  if ($.state.nr_phaseSec < NR_PROMPT_DELAY_SEC) return;
  if (!$.state.nr_placed || $.state.nr_for !== s.id || nr_far(s)) {       // 非表示のまま動かし、表示は次のポーリング（同期待ち）
    if ($.state.nr_shown) { nr_node(NR_NODE)?.setEnabled(false); $.state.nr_shown = false; }
    $.state.nr_for = s.id; $.state.nr_placed = nr_place(s); return;
  }
  if (!$.state.nr_shown) nr_show(NR_TEXT_ASK, true);
}
$.onInteract(player => {
  if (($.state.nr_phase || "idle") !== "asking" || !$.state.nr_shown) return;
  nr_startReset(player);
});
// $.onReceive の switch に追加
case "luida_reset_ack":                     // ConditionManager からの完了通知
  if (arg && arg.token === $.state.nr_token) $.state.nr_cmAck = arg.token;
  break;
```
- 「登録済みの人が残っている」は `exists()` **と** 在室者リストとの `id` の突き合わせの **どちらか** で判定する。`exists()` は一時的な通信不具合でも true なので、P1 が一瞬リストから消えた隙に傍観者へパネルが出ることがない。「未登録の人」は `id` で判定する。`id` は入室ごとに変わると明記されているので、同じアカウントの入り直しも「新しい人」になる。
- `settle` 中に P2 が去っても進行は続ける（戻った先はきれいな初期状態で、次に入った人は確認なしで通常どおり登録される）。
- `$.onInteract` はスクリプトのトップレベルに置く（結合後も PM.js の部分はトップレベル）。押せるのは `NewParticipantPromptYes` のコライダーだけ（PM に他のコライダーは無い）。
- エディタ（CSEmulator）では入退室を再現できないので、この分岐はモックで確かめる（§6.1）。パネルの見た目はプレハブの既定位置（§3.2）で確認できる。

#### 3.1.2 `ConditionManagement/ConditionManager.js` — 3 行
```js
case "luida_participants_info":
  // 新しいセッション（別の sessionID）が始まる: 前のセッションの寄せ集め値を忘れる。途中ステートの exit アクションより確実に後。
  if ($.groupState.sessionID !== arg.sessionID) $.groupState.collectedData = {};
  $.groupState.participants = arg.participants;   // 既存
  $.groupState.sessionID = arg.sessionID;         // 既存
  …
case "luida_reset": {
  … 既存のまま（isLast, isServerAssigned, betweenSubjectsConditions, initializeBetweenSubjectsConditions, reset, token, luida_resetAck）…
  if (sender && sender.send) sender.send("luida_reset_ack", { token: resetToken }); // PM は別グループなので返信で知らせる
  break;
}
```
- 旧 SessionReset がリセット時にやっていた CM グループの `participants = []` / `collectedData = {}` は **`luida_reset` ではやらない**。`participants` は P2 の登録時に上書きされ、退室済みハンドルのままでも参照側は `exists()` を見ている（§1.6）。`collectedData` はリセット時に空にすると途中ステートの exit アクションが P1 の値を書き戻す競合があるので、sessionID が変わる瞬間に空にする（§1.6）。最初のセッション（undefined → sID1）でも空にするが、その時点では何も書かれていない（StateLogger は Start を記録しないので従来と同じ）。

#### 3.1.3 `CustomDataCollection/CustomDataUploader.js` — 約 8 行（判断 §7-a）
`$.onUpdate` の先頭。CM グループの `sessionID` が別の値に変わったら（= 新しい参加者のセッションが始まった）、未送信の行を捨てる。最初の値への変化（undefined → sID1）では捨てない。送信中なら触らない（送信が終わると既存コードが空にする）。

```js
if ($.state.boundSessionID !== $.groupState.sessionID) {
    if ($.state.boundSessionID !== undefined && !$.state.isUploading && $.state.customData && $.state.customData.length > 0) {
        $.log("[DataCollector] new session; dropping " + $.state.customData.length + " unsent row(s) of the previous session");
        $.state.customData = [];
    }
    $.state.boundSessionID = $.groupState.sessionID;
}
```
- 質問紙の `FormController.js` と同じ「グループの sessionID を見て自己初期化する」形。CM グループの `sessionID` は P2 の `HandleParticipantsEnough` → `luida_participants_info` で変わり、それは `state_entered`（Start）より前なので、P2 の行が記録される前に空になる。
- 捨てる行は途中離脱した P1 の未送信分だけ。End まで行った P1 の行は End で送信済み。

#### 3.1.5 「いいえ（続きから）」— 同じアカウントで戻ってきた参加者の結び直し（実装時に追加。ユーザの判断 (b)）
途中で切断された参加者が同じアカウントで戻ってきたら、リセットせずに続けたい。前の PlayerHandle は退室済みで使えない（`idfc` も null になる）ので、「新しい入室を前の参加者の枠に結び直す」必要がある。

- **誰に出すか**: PM は登録時に `$.state.participantIdfcs`（`participants` と同じ並びの idfc）を控える。未登録の人の `idfc` が、退室済みの登録参加者の idfc と一致するときだけ「いいえ」を出し、文言も「新しい参加者なら「はい」、さっきの続きなら「いいえ」を押してください。」にする（`nr_resumeIndex()`）。別アカウントには「はい」だけ。
- **ボタンの実体**: `$.onInteract` は 1 アイテムに 1 つなので、「いいえ」は `LUIDA-ExpManagers.prefab` 配下の別アイテム `NewParticipantPromptNo`（Item + MovableItem + ScriptableItem `NewParticipantPromptNo.js`、子 `Body` にコライダーとテキスト。初期非表示）。PM が `luida_prompt_place {pos, rot}`（非表示のまま移動）/ `luida_prompt_show` / `luida_prompt_hide` を送り、押されるとアイテムが PM に `luida_prompt_no { player }` を返す。PM の参照 id は `NewParticipantPromptNo`（ExpManagers 内の PM インスタンスに追加）。
- **結び直し**（PM `nr_resume()`）: PM グループの `participants[i]` を新しいハンドルに差し替え、`$.setPlayerScript()`、CM に `luida_rebind_participant { index, player }`（CM グループの `participants[i]` を差し替え）。各 FormController は `$.onUpdate` で「自分の `participant` が退室済みで、`participants[pID-1]` が別の生きたハンドル」なら差し替え、Prev/Next ボタンにも知らせ、開いていたフォームは `reopenForm()` で閉じて最初から（回答ボタンとテキストは前の入室にしか見えていなかった）。
- **できないこと**: 位置の復元（スポーン地点から続ける）、開いていた質問紙の途中再開、Touch の途中の試行の継続（NPC は参加者なしで止まり、NpcDirector の 120 秒で先へ進む）。別アカウントの「いいえ」はパネルを閉じるだけ。

### 3.2 `ParticipantManager.prefab` — 確認パネルと GlobalLogic ×5

```
ParticipantManager（Item）
 ├ WaitingMessage, WorldGateToLuidaBar（既存）
 └ NewParticipantPrompt                 ← 新規。初期状態は非アクティブ。ローカル (0, 1.4, 1.2) に置いておく（駐車位置 = エディタでの見た目確認位置）
    ├ Quad 0.9 × 0.45（WaitingMessage と同じマテリアル）          … 背景
    ├ NewParticipantPromptText            ← CCK TextView（WaitingMessage/Text の設定を複製）、文字列は NR_TEXT_ASK
    └ NewParticipantPromptYes             ← Quad 0.3 × 0.12、ローカル (0, −0.15, −0.01)、BoxCollider（非トリガー、0.3 × 0.12 × 0.05）
       └ Text                             ← TextView「はい」
 + GlobalLogic ×5（トリガ: Item キー exp_sessionReset）: state_exited(signal), state_currentID = 0, exp_trialID = 0,
   exp_readyToLeaveTrials = false, exp_arePlayersEnough = false（旧 SessionReset と同じ 5 個。builder の AddGlobalWrite と同じ作り方）
```
- 組み込みは **エディタで 1 回だけ実行するスクリプト**（`PrefabUtility.LoadPrefabContents` → ノードと GlobalLogic を足す → `SaveAsPrefabAsset`。冪等。`Assets/Resources/ClusterMetaverseLab/LuidaExpTemplate/FakeGimmickSources/ResetGlobalBool.prefab` と `LuidaFakeGimmick.PatchStatementAt*` を使う）。Unity MCP の `execute_code` で流し、スクリプト本体は記録として `research/study4-phantom-touch/tools/InstallNewParticipantPrompt.cs` に置く。LUIDA の Editor メニューにはしない（判断 §7-d）。
- サブノード名はアイテム内で一意にする（`$.subNode` は名前で探す。`Text` は WaitingMessage にもある）。
- 向き: WaitingMessage はローカル無回転で、−Z 側（スポーン側）から読める。パネルの回転を「相手の正面 = パネルの +Z」にすると相手から読める。プレハブモードで確認し、逆なら `nr_place` で 180° 回す。
- **コミット**: プレハブには結合済みスクリプト（識別子入り）が含まれるので、前回（e0f3367e）と同じく `ExpIdentifiers.js` をサンプル値に戻して `CombineAll` → コミット → 実値に戻す。

### 3.3 シーン `PhantomTouch.unity`（ユーザ操作、1 オブジェクト）
- Hierarchy の `SessionReset`（state-listening item）を削除して保存。残すと End 後に自動でリセットされる（§1.5）。
- 代わりの設置は不要（PM プレハブが持つ）。シーンの差分は大きいのでコミットはユーザ側で。

### 3.4 `Assets/_Experiment_/` の後片付け（任意。削除だけ。別コミット）
- builder: `InstallSessionReset`, `AddSessionResetItem`, `AddSessionResetItemFromBatch`, `SessionReset*`（定数・リスナー・ハンドラ・legacy）, `defs` の行, `BuildStateListeningItems` の呼び出し, 使わなくなる `RemoveGlobalWrites` / `FindExpManagerItem` / `ParticipantManagerPrefabPath`。`AddGlobalWrite` は `AddSignalRelay` が使うので残す。`ParkExitGate` と ExitPortal のテレポートは残す。
- 生成物: `Scripts/StateManagement/PhantomTouch/SessionReset.js(.meta)`, `StateListeners/SessionReset.asset(.meta)`。
- Instruction の `ins_endText()` の `luida_resetStatus` 分岐（使われない）。コメントの SessionReset への言及。
- テスト `tests/session-reset-item.test.mjs`（旧アイテムのテスト）。
- やらなくても動く。残すと「メニューを実行すると旧アイテムが復活する」罠が残るので、推奨。

### 3.5 途中離脱後の NPC と鏡（推奨。builder 2 行 + NpcController 1 行、2 アイテムの再生成）
途中のステートからリセットすると、Start の間だけ NPC と鏡が前の状態のまま残る（Trial - Start で直る。§1.5）。NPC については見た目だけでなく、P1 の試行の続き（相手を P2 に切り替えて触れに来る。§1.6）を止める意味がある。
- NpcDirector `S_START`: `$.worldItemReference('NPC').send('npc_hide', {});`（`npc_phase = idle`、非表示、`resetHeights()` で台も下がる。リセット後の `npc_done` も出なくなる）
- MirrorPanel `S_START`: `HideChild('Mirror')`, `HideChild('MirrorFront')`
- NpcController `participant()`: 登録参加者がいて退室済みなら null を返す（傍観者へのフォールバックは `participants` が空のときだけ）。確認パネルを読んでいる P2 に NPC が触れに来るのを防ぐ。試行は参加者なしで止まり、120 s で NpcDirector が `npc_abort` → これはリセット前の話なので P2 には関係ない。
  ```js
  if (ps && ps.length > 0) return (ps[0] && ps[0].exists()) ? ps[0] : null;
  ```
`Update item behaviours (keep scene)` で NpcDirector / MirrorPanel を再生成。NpcController.js は直接編集（builder の生成物ではない）。

### 3.6 変えないもの
`FormController.js`（sessionID 連動で開き直す。2026-11-07）、`LuidaBasicPlayerScript.js`、`StateLogger.js`、ExitPortal、`ExpIdentifiers.js`、バックエンド、`upload-reliability-plan.md` の内容。

---

## 4. リセットで戻るもの（誰が戻すか）

| 状態 | 戻す主体 | 確認 |
|---|---|---|
| `state_currentID`, 各 Transition の `state_isActive`, `exp_trialID`, `exp_readyToLeaveTrials`, `exp_arePlayersEnough` | PM の `exp_sessionReset` → GlobalLogic ×5（プレハブ） | PM が Global 4 値を読む |
| 現在のステートの終了アクション（質問紙コンテナの非表示、各 SLI の exit） | Global `state_exited` 信号（上と同時） | — |
| CM の `isLast`, `trialID`, 参加者内条件表, `betweenSubjectsConditions`, `currentCondition` | CM（`luida_reset`） | `luida_reset_ack` の token |
| PM の `sessionID`, `participants`, `isParticipantsEnough`, `qCompletedCount`, `eligibleCount`, envInfo, 拒否キュー, `exp_showWaitingMessage` | PM 自身（`initSession()`。最後） | 例外ならエラー表示・再試行 |
| CM グループ側の `sessionID`, `participants` | PM → CM `luida_participants_info`（P2 登録時、従来どおり） | — |
| CM グループの `collectedData`（寄せ集め値） | CM（`luida_participants_info` で sessionID が変わったとき） | — |
| DataCollector の未送信行 | DataCollector 自身（CM グループの sessionID の変化） | — |
| 質問紙の割当・回答・開閉 | 各 FormController（PM グループの sessionID の変化。既存） | — |
| NPC・鏡・台・パネル類 | 各 SLI の Start / Trial - Start のリスナー（§3.5 を入れれば Start で全部） | — |
| 2 人目の PlayerScript、移動速度 | PM の `setPlayerScript`（登録時）、NpcDirector `nd_tick` | — |

---

## 5. 実装手順（コミット分割）

1. **ConditionManager / CustomDataUploader**（§3.1.2, §3.1.3）＋モックテストの更新。
2. **ParticipantManager**（§3.1.1）＋新しいモックテスト（§6.1）。モックに `PlayerHandle.id` / `getRotation` / `getHumanoidBonePosition`、`SubNode.setRotation` を足す。
3. **プレハブ**（§3.2）: 組み込みスクリプトを MCP で実行 → プレハブモードで見た目と向きを確認 → サンプル識別子で `CombineAll` → プレハブをコミット → 実識別子に戻す。スクリプトは `research/.../tools/` にコミット。
4. **シーン**: ユーザが `SessionReset` を削除（または MCP で削除してよいか確認）。
5. **後片付け**（§3.4）: 別コミット（ユーザ承認済み 2026-11-08: このリセット機能に関する旧コード・旧オブジェクトの削除は `_Experiment_` を触ってよい）。
6. **NPC と鏡**（§3.5、推奨）: 別コミット。
7. **文書**: `IMPLEMENTATION_NOTES.md` §8 を書き換え、この計画に実装日を記す。memory を更新。

---

## 6. テスト

### 6.1 モック（Node）
`tests/session-reset-prompt.test.mjs`（新規）。`world.onSignal` で GlobalLogic を模倣（`exp_sessionReset` → Global 4 値を戻す）。

| ID | 内容 | 期待 |
|---|---|---|
| P1 | P1 登録済み・在室中に別の人が入る | パネルは出ない（登録済みの人がいる） |
| P2 | P1 退室後に P2 入室 | 3 s 後にパネルが P2 の正面に置かれ、次のポーリングで表示。文言 NR_TEXT_ASK、ボタン有効。リセットはまだ起きない（sessionID 不変、CM へ送っていない） |
| P3 | 同じ idfc・別 id で入り直し | P2 と同じく聞かれる |
| P4 | 聞かれた人が押さずに退室 | パネルが隠れて idle。次の人にまた聞く |
| P5 | 「はい」 | `exp_sessionReset` 信号と CM への `luida_reset` が 1 回ずつ。文言 NR_TEXT_BUSY、ボタン無効。Global が戻り ack が来るまで `initSession()` は呼ばれない |
| P6 | Global が戻らない／ack が来ない | 2 s ごとに不足分だけ再送、15 s でエラー文言、進まない。遅れて揃えば完了 |
| P7 | 完了 | 新 sessionID、`isParticipantsEnough = false`、`exp_showWaitingMessage = true`、パネル非表示。次のポーリングで P2 が登録される |
| P8 | `initSession()` が例外 | エラー文言、`isParticipantsEnough` は true のまま、次のポーリングで再試行して成功 |
| P9 | asking 以外で `onInteract` | 何も起きない |
| P10 | サブノードの無いワールド（`subNode` が null） | 検出してもパネルもリセットも起きず、ログだけ |
| C1 | CM: `luida_reset` で `participants` / `collectedData` が空になり、送信元に `luida_reset_ack {token}` が返る。同じ token の再送は初期化せず返信のみ | |
| U1 | Uploader: sessionID が undefined → sID1 では捨てない。sID1 → sID2 で未送信行が消える。送信中なら消さない | |

既存 `luida-reset-handlers.test.mjs` の PM/CM/Form のテストはそのまま通ること。`session-reset-item.test.mjs` は旧アイテムとともに削除（§3.4）。

### 6.2 エディタ
| ID | 内容 | 期待 |
|---|---|---|
| E1 | プレハブモードで `NewParticipantPrompt` をアクティブにして見た目・向きを確認 | 文字が −Z 側（相手側）から読める。「はい」が手前に浮いている |
| E2 | 通常の 1 周（回帰） | パネルは一度も出ない。ログに `[PM]` の行が出ない。End でテレポート退出 |

### 6.3 実機（Cluster テストスペース）
| ID | 手順 | 期待 |
|---|---|---|
| R1 | A が最後まで実施 → 退室 → 数分以内に B 入室 | 入室 3〜5 s でパネルが正面 1.2 m・目の高さに向いて出る。「はい」→「初期化しています…」→ 数秒で Start（WaitingMessage が一瞬出てもよい）。ログ順: `[PM] new participant confirmed` → `[ConditionManager] session reset` → `LUIDA session reset: new sID=` → `Participants are enough` |
| R2 | R1 を同じアカウントで | 同じく聞かれる |
| R3 | A が Trial - Greeting の途中で退室 → B 入室 → はい | Start。Trial - Start で NPC が消え台が下がる（§3.5 を入れた場合は Start で）。B の試行は 4 回。Web Console: A の sID にはアップロード済みの分だけ、B の sID に A の行が混ざらない |
| R4 | A が End 中（テレポート前）に B 入室 | A がいる間はパネルが出ない。A の退室後に出る。A の End の送信が旧 sID で残っている |
| R5 | B がパネルを押さずに退室 → C 入室 | C に聞く |
| R6 | 実験者が入って押さない | 何も変わらない。離れすぎるとパネルが追ってくる |
| R7 | 不達の確認: PM の `ConditionManager` 参照を外してアップロード → R1 | 2 s ごとに再送ログ、15 s でパネルにエラー、B は登録されない |
| R8 | 同じスペースで 3 人目 | 同様 |

---

## 7. 判断してほしい点

- **(a) 途中離脱した人の未送信データは捨てる**（§3.1.3）。残す案は「リセット時に旧 sID で送ってから捨てる」だが、送信確認の設計（`upload-reliability-plan.md`）に踏み込む。途中離脱のセッションは不完全データなので捨ててよい、という前提で進める。
- **(b) 「いいえ」ボタン**: 当初は付けない案だったが、ユーザの要望（切断された参加者が同じアカウントで戻ったら続きから）で「いいえ（続きから）」を別アイテムとして付け、同じアカウントの人にだけ出す（§3.1.5）。
- **(c) `_Experiment_` の変更**: 後片付け（§3.4、削除のみ）は 2026-11-08 に承認済み。§3.5（NpcDirector / MirrorPanel の Start に 2 行、NpcController の `participant()` 1 行）は削除ではなく挙動の追加なので、やるかどうかの判断が要る（推奨: やる。途中離脱後に NPC が P2 を相手に試行を続けるのを止める）。
- **(d) プレハブの組み込み方法**: 一回限りのスクリプト（推奨。テンプレートに Editor コードを増やさない）か、LUIDA のメニューにするか。
- **(e) 文言**: NR_TEXT_* の 3 つ。Study 4 は日本語だが、テンプレートとしては定数にしてあるので別実験では書き換える。
- **(f) シーンの `SessionReset` 削除を私が MCP でやってよいか**（ユーザがシーンを手で編集中のため確認）。

---

## 8. リスクと注意

- **保存した PlayerHandle の `id` / `exists()`**: `$.groupState` に入れた PlayerHandle が再開後も使えることを前提にしている（旧設計と同じ前提）。使えなければ `enrolledHere` が false になり「誰か入れば必ず聞く」側に倒れる（安全側）。R1/R4 で確認。
- **既存の挙動のうち、今回の変更で変わるもの**（§1.6 の確認結果）: Exit Time タイマー・`exp_trialID`・exit/during アクションはリセットで誤動作しない。変わるのは「途中離脱したセッションのインスタンスに入った人が、何も起きない代わりに確認パネルを見る」ことと、§3.5 を入れた場合の Start での NPC・鏡の非表示だけ。1 人目の通常の流れ（Start → End）では新しいコードは `nr_tick` の判定（登録済みの人がいる間は何もしない）しか走らない。
- **リセット直前 0.2 s の `ToNextState()`**（§1.6）: 理論上リセット後に 1 回遷移しうる。「はい」と前のセッションの遷移要求が同じ 0.2 s に重なる必要があり、無視する。
- **サブノード移動の補間**: 非表示で動かし、1 s 後に表示する。それでも飛んで見えるなら表示までのポーリングを 1 回増やす。
- **`getHumanoidBonePosition`**: エディタのエミュレータで例外になる既知の問題（`IMPLEMENTATION_NOTES.md` §2-5）があるので、テストモードでは読まない。実機で null なら 1.4 m。
- **押せる人**: 在室者なら誰でも。実験者が手動リセットに使える。
- **登録中に退室した人**（`isParticipantsEnough` がまだ false のとき）は従来どおりの LUIDA の挙動（この計画の対象外。`participants` に退室済みの handle が残る既存の問題）。
- **バックエンド**: 途中離脱した P1 のセッション行は残る（条件均衡と `maxSessionCount` に数えられる）。Web Console 側で扱う。
- **100 KB 超の送信**（既存の問題）は変わらない。
- **Player Local UI を使わない理由**: VR で確実に動く既存方式に合わせた。将来 PlayerScript 側で画面に出したくなれば、同じ PM のロジックから `player.send()` で出し分けられる。

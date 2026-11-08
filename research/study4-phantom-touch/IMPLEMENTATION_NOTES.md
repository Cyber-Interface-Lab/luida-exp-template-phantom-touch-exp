# Study 4（PhantomTouch）実装メモ

- 実装日: 2026-10-24（2026-10-26 更新: 挨拶期間・NPC 表示制御・笑顔・鏡・単一 VEQ ステート／手のひらの向きの修正。2026-11-04 更新: 表示されない不具合の修正、UI レイアウトの作り直し、顔を撫でる動作。2026-11-07 更新: 同じスペースで次の参加者を迎えるセッションリセット、退出ゲートを遠方へ移動。2026-11-08 更新: 身長合わせ、無反応時の頷き、30 秒の挨拶、頬を狙う接触点と手の向き、撫で方、表情のギミック化、質問紙の上の指示文、デブリーフ文、試行内報告の選択肢の更新（英語併記、「その他」の自由記述）、注意の質問を最後へ、機器（ポーズ）確認を各ブロックの着替えの後へ移し正面に鏡、着替え指示の横にアバターメニューの写真、VEQ の指示文に「あなた」）
- 設計書: `implementation-plan.md`（同フォルダ）
- 生成シーン: `Assets/_Experiment_/Scenes/PhantomTouch.unity`
- 生成手段: `Assets/_Experiment_/Editor/PhantomTouch/Study4SceneBuilder.cs`（メニュー `LUIDA > Study4 > Build PhantomTouch scene`）。LUIDA のエディタ API（シーンテンプレート、State Machine タブの生成処理、State-listening Item 生成、質問紙束縛、Data Collector、アバターラッパー生成）をそのまま呼び出しているので、生成物は LUIDA の各ウィンドウでそのまま編集できる。

## 1. 生成されたもの

| 種別 | パス | 内容 |
|---|---|---|
| シーン | `Assets/_Experiment_/Scenes/PhantomTouch.unity` | テンプレート由来の環境 + 下記すべて |
| ステート | `Assets/_Experiment_/Settings/StateList/PhantomTouch.asset` | Start（質問紙なし、OK ボタン）→ Trial - Start → Trial - PoseCheck → Trial - Greeting(30 s) → Trial - Touch → Trial - Report → Trial - VEQ(qID2) → Trial - Rest(1 s) → SocialPresence(qID3) → PersonalExperience(qID4) → Debrief（質問紙なし、OK ボタン）→ End |
| 実験変数 | `Assets/_Experiment_/Settings/ExperimentVariables/PhantomTouch.js` | within: `block`=1,2 / `rep`=1,2（非ランダム）、between: `social`=with,without / `order`=daily_first,assigned_first、Trials Count 1 → 4 試行 |
| 質問紙フォーム | シーン内 `LUIDA-QuestionnaireByState/<State>/Questionnaire_p1` | VEQ（qID 2）, SocialPresence（qID 3）, PersonalExperience（qID 4）。qID は Web Console 側の登録順と一致させること。Debrief の質問紙は 2026-11-04 に、Start の同意質問紙は 2026-11-08 に外した（qID はそのまま）。各コンテナは初期状態で非アクティブ（ステート開始時にギミックが有効化） |
| Data Collector | `Assets/_Experiment_/Scripts/DataCollectors/PhantomTouch.js`（Code モード、設定は `Settings/DataCollectorConfig/PhantomTouch.asset`） | 1 行のフィールド一覧は設計書 §12 |
| State-listening Items | `Assets/_Experiment_/Scripts/StateManagement/PhantomTouch/*.js` と `StateListeners/*.asset` | `Instruction`, `NpcDirector`, `AvatarGate`, `DeviceCheck`, `ReportPanel`, `MirrorPanel`, `ExitPortal`, `SessionReset`（§8） |
| NPC | `Assets/_Experiment_/Prefabs/PhantomTouch/NPC.prefab`（シーンに配置済み） | YoungAvatar.vrm のラッパー（モデル子オブジェクト名 `Model`）+ `Scripts/PhantomTouch/NpcController.js` + `Avatars/PhantomTouch/Generated/NPC_BoneMap.js`（目ボーン追加済み）+ `npc_done` を Global へ中継する GlobalLogic + 顔メッシュ `Face` の Animator（`NpcFace.controller`: Bool `joy` / Trigger `surprised`、クリップ `NpcFaceNeutral/Joy/Surprised`）と、それを NPC アイテムの状態 `npc_joy`（Bool）・信号 `npc_surprised` から動かす CCK の Set Animator Value Gimmick 2 個（§2-4） |
| ボタン | シーン内 `ReportPanelUI/RP_0..RP_10, RPW_0..RPW_7, RP_Done`, `AvatarGateUI/AG_Changed, AG_Yes, AG_No`, `DeviceCheckUI/DC_Force`, `DebriefUI/DB_Ok` | 各ボタンは Item + Interact Item Trigger（Specified Item → 親 SLI の Integer 状態）+ `Scripts/PhantomTouch/Study4Button.js`（ラベル・表示・ON/OFF） |
| 鏡 | `MirrorPanel`（SLI）配下に CCK の `Mirror.prefab` を 2 枚（`Mirror` と `MirrorFront`、どちらも 1.2 × 1.8 m、初期非アクティブ） | `Mirror`: 参加者の左前方 45°・1.3 m、参加者の方を向く（自分のアバターと、顔に触れる NPC の手が映る）。Trial - Greeting 開始で表示、Trial - Touch 終了で非表示。`MirrorFront`: 正面 1.6 m（中心の高さ 1.1 m）。Trial - PoseCheck（rep=1）の間だけ表示。配置は §7 |
| アバター変更の写真 | `AvatarGateUI/AvatarGate/MenuPhoto1`, `MenuPhoto2`（Quad、Unlit/Texture、コライダーなし、初期非アクティブ）。画像は `Assets/_Experiment_/Textures/PhantomTouch/open-menu.png`（1: メニューを開いて「アバター」）と `open-avatar-menu.png`（2: アバター変更画面で「LUIDA Default Avatar」を選び「アバターを変更」）、マテリアルは `Materials/PhantomTouch/MenuPhoto1.mat`, `MenuPhoto2.mat`。画像は 2 の累乗へ縮小せずに取り込む | 着替え指示（AvatarGate）の右隣に上から 1, 2 の順で縦に並べる（幅 0.52 m、縦横比は画像のまま）。AvatarGate が rep=1 の着替えの間だけ表示。2 は Default Avatar を選ぶ写真なので、Default Avatar のブロックでだけ出す（普段使いのブロックでは 1 だけ） |
| 身長合わせ | `HeightPlatform`（Item + `Scripts/PhantomTouch/Study4Platform.js`、立ち位置。子 `Cube` 1.6 × 1 × 1.6 m、コライダー付き）と NPC の子 `Riser`（0.8 × 1 × 0.8 m、コライダーなし） | どちらも高さ 1 m の直方体で、上面が足元（床）にあるので通常は床下に隠れ、持ち上げた分だけ床の上に出る。NPC が `platform_set { h }` で台を上げる。§2-4 |
| その他 | `FloorMarker`（Quad）、`Materials/PhantomTouch/*.mat`、`ExitPortal`（立ち位置に配置）配下に移した `WorldGateToLuidaBar`（ExitPortal から (100, 100, 100) 離れた位置に置き、End の 10 秒後に参加者をそこへテレポートする） | |

レイアウトはスポーン地点 (0,0,-2) を原点、+Z を正面として配置している。NPC は実行時に参加者の頭位置から立ち位置を再計算するので、初期位置は仮。

## 2. ランタイムの流れ（要点）

自己アバター条件（参加者内）は **Default Avatar（assigned）vs 普段使い（daily）**。Web Console の参加者アバターモードは DEFAULT（`luida_default_avatar`）で、このワールドではアバター変更メニューに「Default Avatar」が表示される。行データの `avatar` は従来どおり `assigned` / `daily`、実験変数 `order` も `daily_first` / `assigned_first` のまま。

参加者の移動（スティック／キー操作の移動速度）は入室から 0。動けるのは `Trial - Greeting` の間だけ（End では退出ゲートへテレポートするので、歩く必要はない）。NpcDirector の `nd_tick` が 1 秒ごとに `setMoveSpeedRate` を掛け直す（LUIDA のプレイヤースクリプトが参加者の初期化時に 1 へ戻すため）。部屋の中を実際に歩くことは止められない。

1. `Start`: 質問紙なし（同意は募集側で取る）。正面の指示板に、何をするかだけを書いた説明（条件や仮説には触れない）と、その下に「OK」ボタン（Debrief と同じ `DebriefUI/DB_Ok`）。押すと遷移（デバッグ用にステートへ Exit Time を付けてもよい）。NPC は非表示。
2. `Trial - Start`（rep=1 のみ）: NPC に `npc_setup`（マーカーの位置・向き・床の高さを渡す。前のブロックの身長合わせを解除し、足元の台を下げる）を送ってから参加者をマーカー（床の高さ）へテレポートし、NPC を非表示（`npc_hide`）にして AvatarGate が着替え指示（Default Avatar の条件では「メニューのアバター変更に表示される『Default Avatar』に着替えてください」）→「着替えました」→「はい/いいえ」→ 行保存 → 遷移。rep=2 では AvatarGate が即 `ToNextState()`。着替えの指示の間、パネルの右隣にアバター変更の手順の写真を出す（1: メニューを開く。2: アバター変更画面。2 は Default Avatar のブロックだけ）。Default Avatar の骨格値（`AG_D_ARM` / `AG_D_SHOULDER`）は未計測なので、現在は自動判定なしで「着替えました」をすぐ出し、二段階の自己申告で進める（行データ `avatarCheckFallback = true`、`avatarIsDefault = null`）。Cluster 上で Default Avatar を着て `[AvatarGate] signature …` のログ値を 2 つの定数（builder の `AvatarGateLegacy`）に入れると、骨格による一致判定（1 秒安定）が有効になる。
3. `Trial - PoseCheck`（rep=1 のみ。rep=2 は DeviceCheck アイテムが即 `ToNextState()`）: 着替えの後、NPC が現れる前に、ブロックごと（アバター条件ごと）にトラッキングとポーズを確認する。正面に鏡（`MirrorFront`）を出し、指示板は「鏡を見ながら、次の動きをしてください。1) 頭をゆっくり左右に向ける 2) 両手を頭より高く上げる」。DeviceCheck（右側の緑のパネル）が、頭を左右 25° 以上回す ＋ 両手を頭より上に 1 秒を判定する。60 秒経過で救済ボタンが出る。合格で行を保存して遷移（行データ `deviceCheckSec`, `deviceCheckForced`。ブロックごとに 1 行）。以前は Start の直後に 1 回だけ行っていた（ステート名 DeviceCheck）。デバッグ時はこのステートに Exit Time（数秒）を付けると自動で進む。本番では付けない。
4. `Trial - Greeting`（30 秒、rep=1 のみ。rep=2 は即遷移）: 参加者は歩いて移動できる（終了時に再び 0）。NpcDirector が `npc_show` → NPC がまず身長を合わせる: 参加者の頭ボーンの高さ（頭ボーン − 足元）と自分の頭ボーンの高さを比べ、差が 5 cm 以上なら、参加者が低いときは立ち位置の台（`HeightPlatform`）を差の分だけ上げて参加者をその上に乗せ（位置だけテレポート、向きはそのまま）、NPC が低いときは自分の足元の `Riser` に乗る（NPC の移動時は一緒に動く）。着替え直後でボーンが読めないときは最大 3 秒待って再試行し、読めなければ合わせない。次にマーカーの正面方向、会話距離（手が届く位置 + 0.45 m ≈ 0.9 m）に現れる。鏡が表示される。指示板は「30 秒間、目の前のアバターを見て、手を振って挨拶してください」。行データに `participantHeadH`, `npcHeadH`, `heightPlatform`, `npcLift`（m）。閾値は `NPC_CFG.HEIGHT_MATCH_MIN`。
   - social = with:
     - 視線: 頭（と目）だけで参加者を追う（頭は最大 50°、目はさらに 12°）。参加者が NPC の正面から 35° 以上ずれると体全体が補間（指数的、2.5/s）で向き直り、4° 以内で止まる。体が回るにつれ頭のローカル回転は自然に戻る。
     - 反応: 参加者の視線が NPC に向いた瞬間（30° 以内、45° で解除）と、参加者が手を頭の高さ付近まで上げた瞬間に反応する（2.5 秒のクールダウン）。最初の反応は必ず「頷き＋手振り＋笑顔」。以降、視線への反応は頷きのみ／手振りのみ／両方をランダム、挙手への反応は手振り（頷きは 50%）。笑顔（`Fcl_EYE_Joy`=100, `Fcl_MTH_Joy`=50）は 50% の確率で付き、反応の終了とともに戻る。
     - 無反応が続くとき: 反応が 5 秒間（`IDLE_REACT_SEC`）なければ、頷き＋笑顔（手振りなし）を 1 回する。静かなままなら 5 秒ごとに繰り返す。この頷きは「最初の反応」にもクールダウンにも数えないので、直後の挨拶にはすぐ反応する。回数は `greetNpcIdleReactions`。
     - 触られたとき: 参加者の手が NPC の頭・胴・腕に触れた瞬間に驚き顔（`Fcl_EYE_Surprised`=50, `Fcl_MTH_Surprised`=50）を 1 秒（1.5 秒のクールダウン）。
     - 表情は顔メッシュ `Model/Face` の Animator（`NpcFace.controller`: Bool `joy`、Trigger `surprised`）で切り替える。Cluster Script からはブレンドシェイプを直接書けない（`unityProp` で触れる SkinnedMeshRenderer のプロパティに重みは無い）ので、クリップで動かす。Animator のパラメータは、同じオブジェクトに付けた CCK の Set Animator Value Gimmick 2 個（NPC アイテムの状態 `npc_joy`（Bool）→ `joy`、信号 `npc_surprised` → `surprised`）が書き、スクリプトは `$.setStateCompat('this', 'npc_joy', …)` / `$.sendSignalCompat('this', 'npc_surprised')` を呼ぶだけ（LUIDA の「Show item」と同じ仕組みで、エディタのプレビューでも Cluster でも動く）。以前はスクリプトが `getUnityComponent('Animator').setBool` を直接呼んでいたが、NPC のモデルをシーン上で差し替えたあと新しいモデルには Animator が無く、表情が出なかった。keep-scene メニューと `LUIDA > Study4 > Rebuild NPC face animator` は、シーン上の NPC の今のモデルから 4 つのシェイプキーを持つメッシュを探して Animator とギミックを付け直す。
   - social = without: NPC は立っているだけ（注視も反応もなし）。
   - 期間終了時に `greetSec / greetGazeEvents / greetHandRaises / greetNpcReactions / greetNpcNods / greetNpcWaves / greetNpcSmiles / greetNpcIdleReactions / greetTouches` を収集データへ書き込む（同じブロックの 2 試行目の行にも残る）。これらの列は 2026-11-08 まで Data Collector の列一覧に入っておらず行に出ていなかった（同日に追加）。
5. `Trial - Touch`: NpcDirector が `npc_trial_start`（`reset: true`）を送信。NPC は開始の瞬間に参加者の位置と向きをマーカー（初期位置。台があればその上）へ戻し、1 秒待ってから（テレポートの反映待ち）、戻った参加者の方へ向き直りながら、1 秒でマーカーの正面方向の手の届く位置（頭から約 0.5 m）へ前進し（頭の向きではなくマーカーの向きを使うので、参加者が鏡を見ていても正面に立つ）、 prep(2 s, with 条件は注視＋会釈/手振り) → ready(1.2 s で手を肩と目標を結ぶ線上の 35% 地点へ。指は水平から 45° 上向き、手のひらは目標の方向) → approach(その線に沿って 2 cm/s で、指の腹が目標の 3 cm 手前に来るまで。約 15 秒) → stroke(撫でる: 指の腹を顔に沿って真下へ 4 cm（2 cm/s）→ 顔から 3 cm 引く → 引いたまま上へ戻る → 再び触れる、を 3 回。戻りの 3 区間は 4 cm/s。計 11 秒。手の向きは接近時のまま) → hold(最後の撫で終わりの位置で 1 s) → retract → 元の位置（会話距離）へ後退してから消える。目標点は参加者の頬: Head ボーンの 2 cm 上、参加者から見て左へ 4 cm、前へ 9 cm（`FACE_UP`, `FACE_SIDE`, `FACE_FWD`）。本番（LUIDA の `isTestMode` が false。NpcDirector が `npc_setup { eyes }` で伝える）では目ボーンの中点の 4.5 cm 下（`CHEEK_BELOW_EYES`）を使う。エディタのエミュレータは目ボーンの無いアバターで `getHumanoidBonePosition` が null を返さず .NET 例外を投げ、JS の try/catch では受けられずハンドラ全体が止まる（2026-11-08 に NPC が出なくなった原因）ので、テストモードでは目ボーンを読まない（以前は Head ボーンの 5 cm 上＝目のすぐ下で、高すぎた）。撫で方は `STROKE_AMP` / `STROKE_BACK` / `STROKE_CYCLES` / `STROKE_RETURN_SPEED`（`STROKE_CYCLES` 0 で撫でない）。行データに `strokeEndTs`, `strokeAmp`, `strokeBack`, `strokeCycles`, `strokeReturnSpeed`（撫で始め = `contactTs`）と、そのときの `heightPlatform`, `npcLift`。消えた後に `npc_done`（Item 信号 → GlobalLogic → Global 信号）→ NpcDirector が遷移するので、報告パネルや質問紙の間 NPC はいない。各ブロックの 2 試行目は、消えていた NPC が会話距離に現れて 0.5 秒後に前進する。120 秒の安全タイムアウトあり（このときも NPC は後退して消える）。鏡はこのステートの終了で非表示。
6. `Trial - Report`: 0–10 → （評定≥1 のみ）感覚の種類（複数）→ 部位（複数）→ 操作チェック 1–7（相手に注意を向けられたと感じたか。2026-11-08 から最後に回した）→ 行保存 → 遷移。数字は `RP_*`（4 × 3）、種類と部位は幅の広い `RPW_*`（2 × 4）に出す。
   - 種類（`ptype`）: 1 触れられた感じ（Touch）/ 2 圧迫感（Pressure）/ 3 温かさ / 4 冷たさ / 5 ピリピリ・チクチク・しびれ（Tingling）/ 6 くすぐったさ・かゆみ / 7 風が通る感じ / 8 その他。
   - 部位（`ploc`）: 1 額 / 2 目・目のまわり / 3 頬 / 4 鼻・鼻のまわり / 5 唇・口のまわり / 6 あご / 7 頭の側面・耳 / 8 その他。場所が分からない人は「その他」を選ぶ想定。
   - 値は選んだ番号を昇順に `,` でつないだ文字列（例 `1,5`）。評定 0 の行は空。2026-11-08 に選択肢を入れ替えたので、それより前のテストデータとは番号の意味が違う。
   - 「その他」を含めて「決定」を押すと、Cluster の文字入力（`requestTextInput`）が開く。入力した文字列は改行を空白に置き換えて `ptypeOther` / `plocOther` に入る。入力を閉じるか、1.5 秒以上たってからもう一度「決定」を押すと、空のまま次へ進む。入力できない状態（Busy）なら 2 秒ごとに最大 5 回まで開き直す。
7. `Trial - VEQ`: NpcDirector が `rep` を見て、各ブロックの 2 試行目以外は即 `ToNextState()`。該当時は質問紙の上に「あなたがいま使っているアバターについて伺います。問題文の「仮想身体」は、あなたのアバターのことです。」を出し（相手のアバターではなく、参加者自身のアバターについて聞いていることをはっきりさせる）、質問紙（VEQ, qID 2）の完了で遷移（NPC は触る段階の終わりに消えている）。ブロック 1・2 の回答は同じ qID に保存されるので、時刻順で区別する。
8. `SocialPresence`(qID 3、質問紙の上に「あなたの顔に触れてきた相手についてのアンケートです。」) → `PersonalExperience`(qID 4、「最後のアンケートです。」) → `Debrief`: 正面の指示板にデブリーフ文（感謝 → 調べていたこと: ファントムセンス（VR感覚・V感）のうち、誰かに触れられたと感じるファントムタッチ錯覚が、相手の反応や自分のアバターに影響されるか → その錯覚の説明 → 条件（相手の社会的な反応の有無 × 普段使いのアバターかどうか）→「【お願い】」に続けて、今月中は内容と条件を他言しないお願い → OK の案内。13 行、文字 0.022）、その下に「OK」ボタン（`DebriefUI/DB_Ok`、Instruction アイテムの Integer 状態 `ins_btn` に書く）。押すと `End` へ。
9. `End`: データを 1 回アップロード。指示板に「あと N 秒で募集ワールドへ移動します」（10 秒のカウントダウン）を出し、0 になった時点で ExitPortal が退出ゲート（CCK World Gate）を有効にして、参加者をそのゲートへテレポートする。ゲートはスポーン地点から遠い位置（ExitPortal のローカル座標 (100, 100, 100)）にあり、ParticipantManager が参加拒否のときに使う方式と同じ。World Gate は触れた瞬間に移動させるので、カウントダウンの後に有効にしている（秒数は builder の `EndGateDelaySec`）。以前は参加者の足元に出していたが、それだとゲートがスポーン地点に残り、同じスペースに次に入った人がすぐ送り返されていた。参加者が退室した後の流れは §8。

## 3. 残作業・確認事項（優先順）

1. Web Console（手動）: 実験作成（定員 1、Allowed platforms = VR、Participant Avatar = DEFAULT）、質問紙 qID 1–4（Start の同意、VEQ、SocialPresence、PersonalExperience）をこの順に登録、実験 ID を `LUIDA > Configure experiment identifiers` に設定、ワールド ID 登録。
2. テスト（設計書 §16）: T2（Default Avatar の骨格値 `AG_D_ARM`/`AG_D_SHOULDER` を実測して設定。未設定の間は自己申告のみ）、T3、T4（2 cm/s・停止位置・身長差）、T5、T6、T7（Custom Log 7 行・100 kB 未満）、T8、T10。
3. 文言・レイアウト調整: 文言は `Study4SceneBuilder.cs` の `InstructionListeners` と各 Legacy code（`AvatarGateLegacy`, `DeviceCheckLegacy`, `ReportPanelLegacy`）、配置・文字サイズ・背景色は §3b の定数と `ApplyLayout`（§7）。変更後はメニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)`（UI の配置のほか、`HeightPlatform` と NPC の `Riser` が無ければ作り、`Trial - Greeting` の Exit Time を builder の `GreetingSeconds` に合わせ、アイテムの動作と JS を書き直す）。NPC の距離・反応の閾値は `NpcController.js` 冒頭の `NPC_CFG`（`IDLE_EXTRA_DIST`, `LOOK_AT_DEG`, `HAND_RAISE_OFFSET`, `JOY_PROB`, `IDLE_REACT_SEC`, `HEIGHT_MATCH_MIN`、目標点の `CHEEK_BELOW_EYES` / `FACE_SIDE` / `FACE_FWD`、手の `HAND_PITCH_DEG` / `CONTACT_LEN`、撫で方の `STROKE_*` など）。
4. 既知の軽微な点: ボタンは Study4Button.js の `btn_cfg` を受け取るまで非表示。ReportPanel はボタンへのメッセージを 1 フレーム 4 件ずつに分けて送る（ワールドアイテムの `send` の上限はスペース全体で 3000 回/秒なので余裕はある。数字から語の選択肢に切り替えるときで 20 件）。

## 4. 再生成

`LUIDA > Study4 > Build PhantomTouch scene` を実行すると、PhantomTouch 用の生成物（シーン、Settings、Scripts/StateManagement/PhantomTouch、Avatars/PhantomTouch、Prefabs/PhantomTouch）を削除してから作り直す。手で加えた変更は失われるので、恒久的な変更は `Study4SceneBuilder.cs` 側に反映すること。

## 5. NPC の腕の姿勢（手のひらの向き）

各腕ボーンの回転は「骨の向き」と「ひねりの基準」の 2 つで決める（`NpcController.js` の `basisRot` / `armRots`）。T ポーズ（VRM 規約: 手のひら下向き、肘は前方へ曲がる）を基準に、上腕は肘の曲がる向き、前腕と手は手のひらの法線を合わせる。

| 場面 | 手のひらの向き | 指の向き |
|---|---|---|
| 待機 | 体側（太もも側） | 下 |
| 手を振る（左手） | 参加者側（正面） | 上（左右に振る） |
| 手を伸ばす（右手） | 目標（頬）の方向のうち、指に直交する成分 | 水平から 45° 上（`HAND_PITCH_DEG`。接近線の傾きによらず一定） |

接触判定に使う点は指の腹（手首から指方向 12 cm（`CONTACT_LEN`）、手のひら側へ 1.5 cm（`PALM_OFF`））。指先はそこから約 3 cm 先で、目標点の約 1 cm 手前で止まる。手首の反りは約 21°、肘の曲がりは約 49°（オフライン検証 `sim_stroke.js`）。値は `NPC_CFG` の `READY_FRAC`, `HAND_PITCH_DEG`, `CONTACT_LEN`, `PALM_OFF` で調整できる。

## 6. 修正履歴: テキストやボタンが表示されない不具合（2026-11-04）

- **症状**: デバイスチェックの後に着替えボタンが出ないことがある。DeviceCheck・AvatarGate のテキストと、試行内報告（0〜10 評定）の問題文が表示されない。
- **原因**: LUIDA のステート連動アイテムは、ルートの Set Game Object Active Gimmick（`exp_showItem`）によって、`Show item` を一度も呼ばない限り非アクティブのままになる。指示板（Instruction）以外のアイテムは `Show item` を呼んでいなかったため、子のテキスト、鏡（MirrorPanel）、退出ゲート（ExitPortal）が描画されなかった。ボタンは別アイテムなので表示されていた。着替えの指示文が見えないため、普段使い条件では「着替えないとボタンが出ない」状態に気づけなかった。
- **修正**: すべてのステート連動アイテム（NpcDirector, AvatarGate, DeviceCheck, ReportPanel, MirrorPanel, ExitPortal）で、Start ステートの最初に `Show item` を実行する。
- **保険**: AvatarGate は、骨格による自動判定が 30 秒以内に一致しない場合でも「着替えました」ボタンを出し、二段階の自己申告で進める（`AG_FALLBACK_SEC`、0 で無効）。このとき行データに `avatarCheckFallback = true` を記録する。計測した骨格値（腕長・肩幅・頭高）を 5 秒ごとに `[AvatarGate] signature …` としてログに出すので、Cluster 上での透明アバターの実測値を確認して `AG_T_ARM` / `AG_T_SHOULDER` を更新できる。
- **反映方法**: メニュー `LUIDA > Study4 > Update item behaviours (keep scene)`。builder の定義からアイテムの動作（リスナー、イベント、Legacy コード）と Data Collector スクリプトを書き直して結合する。シーンのオブジェクトには触れない。ただし GUI でアイテムの動作を手で変えていた場合は上書きされる。

## 7. UI レイアウト（2026-11-04）

参加者の立ち位置（スポーン、目の高さ 1.55 m）から見た方位角（正面 0°、右が +）と仰角で配置する。同時に表示されるものどうしが重ならないようにしてある（エディタ上で各メッシュの角度範囲を計算して確認）。

| 表示されるステート | 物 | 方位角 / 仰角 / 距離 |
|---|---|---|
| VEQ, SocialPresence, PersonalExperience | 質問紙（LUIDA） | ±34° / −25〜+23° / 2 m |
| 同上 | 指示板「above」位置（質問紙の上端から 0.05 m 上、文字 0.03。2026-11-08 に 0.2 m 下げた） | ±23° / +28〜+33°（2 行時） / 1.7 m |
| Start, Debrief, End | 指示板「center」位置（正面）と OK ボタン（Start・Debrief、その下） | デブリーフ（13 行、文字 0.022）±22° / −11〜+18°、ボタン −17° / 1.5 m |
| 上記以外 | 指示板「front」位置（NPC の頭の上） | ±14° / +17〜+28°（4 行時） / 1.5 m |
| Trial - Start | AvatarGate（紫、正面。NPC は非表示） | ±20° / −22〜+4° / 1.25 m |
| Trial - Start | アバター変更の写真 1・2（AvatarGate の右隣、上から順に） | +22〜+45° / −25〜+3° / 1.25 m |
| Trial - PoseCheck | DeviceCheck（緑） | +27〜+53° / −16〜−2° / 1.25 m |
| Trial - PoseCheck | 正面の鏡（`MirrorFront`。上端は front 位置の 3 行の文字の下端 +19° より下） | ±21° / −40〜+16° / 1.6 m |
| Trial - Report | ReportPanel（茶、正面。NPC は非表示） | ±19° / −32〜+5° / 1.25 m |
| Trial - Greeting, Trial - Touch | 鏡 | −20〜−70° / −41〜+21° / 1.3 m |

- **文字**: CCK の TextView では全角 1 文字の幅が size × 1.85、行の高さが size × 2.74（実測）。指示板 0.024（1.5 m で 1 文字約 1.7°）、パネル 0.018（1.25 m で約 1.5°）。1 行の長さは場所ごとの空きに合わせた（全角換算）: front（NPC の頭上、隣に鏡）20 字、above（質問紙の上）26 字、center 26 字（デブリーフは 30 字）、AvatarGate と ReportPanel（正面）24 字。パネルの文字は下端を基準に上へ伸びるので、行数が増えてもボタンに重ならない。
- **背景**: 文字ごとに半透明の色板（Standard / Fade、文字より先に描画する render queue 2990、コライダーなし）。指示板は紺、AvatarGate は紫、DeviceCheck は緑、ReportPanel は茶。背景は各 `Text` の子なので、文字と一緒に表示・非表示になる。指示板の背景は 1 枚（`Bg`）で、`ins_show` が行数と最長行の文字数から大きさを計算し、`getUnityComponent('Transform').unityProp.localScale` で合わせる。
- **指示板の移動**: Instruction アイテムは立ち位置に置き、`ins_show(slot, text, size?)` が `Text` サブノードを front（NPC の頭上）/ above（質問紙の上）/ center（正面）に移し、文字サイズも切り替える（`SubNode.setPosition/setRotation/setTextSize`）。Start は center に課題の説明だけ（条件・仮説なし）と OK ボタン。質問紙のあるステートの文言: VEQ「あなたがいま使っているアバターについて伺います。問題文の「仮想身体」は、あなたのアバターのことです。」、SocialPresence「あなたの顔に触れてきた相手についてのアンケートです。」、PersonalExperience「最後のアンケートです。」。
- **ボタン**: 報告パネルの数字は 4 列 × 3 行（0〜10 を左上から順に、0.16 × 0.10 m）。種類と部位は別の 2 列 × 4 行のボタン（0.38 × 0.115 m、上端は数字の格子と同じ高さ）で、ラベルは問題文と同じ 0.018（1 行全角 10 字まで、2 行まで）。その下に「決定」。ラベルの文字サイズは `Study4Button.js` がボタンに収まるように決める（`btn_cfg` の `fit`）。AvatarGate の「着替えました」と「はい/いいえ」は別の行（連打で確認を飛ばさないように）。
- **NPC と質問紙**: 会話距離の NPC は質問紙の手前に立ってしまうので、毎回の触る段階の終わりに元の位置へ戻ってから消える（§2-5）。
- **反映方法**: メニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)`。上記の 5 つのルート（Instruction, AvatarGateUI, DeviceCheckUI, ReportPanelUI, MirrorPanel）の配置・文字サイズ・背景だけを変え、続けてアイテムの動作を書き直す。ステートリストなど他の設定には触れない。フルビルドも同じ `ApplyLayout` を使う。
- **ステートの並べ替え（2026-11-08）**: メニュー `LUIDA > Study4 > Move the pose check into the trials (keep scene)` が、ステートリストの DeviceCheck を `Trial - PoseCheck` に改名して `Trial - Start` の直後へ移し、実験変数 JS の `state_names` と既存のステートオブジェクト（並び順、各 Transition のステート ID・遷移先・Exit Time、Trial - Rest の戻り先）を合わせてから、上のメニューと同じ更新を行う。LUIDA の State Machine タブの再生成は質問紙フォームも作り直すので使わない。2 回目以降の実行では並べ替えずに ID だけ合わせ直す。

## 8. セッションリセット（2026-11-07）

End まで終えた参加者が退室した後、同じスペース（インスタンス）に次の人が入ったら、ワールドを最初の状態に戻して実験を最初から始める。設計と判断の経緯は `session-reset-plan.md`（改訂 3.1）。送信成功の確認と再送は範囲外で、`upload-reliability-plan.md` に後回しにしてある。

- **いつ動くか**: Cluster では誰もいないスペースのスクリプトは止まっているので、リセットは次の人が入室した時点で行う。`SessionReset` アイテムが 0.5 秒ごとに「End である、End に入ってからスクリプト時間で 5 秒以上、前の参加者が退室済み、誰かが入室している」を確かめる。5 秒は、End のデータ送信（End 開始の 1 秒後に発行）を前の参加者の sessionID のまま発行させるための待ち時間で、送信成功の保証ではない。
- **手順**: (1) `exp_sessionReset` 信号 → GlobalLogic 5 個が Global を戻す（`state_exited`、`state_currentID = 0`、`exp_trialID = 0`、`exp_readyToLeaveTrials = false`、`exp_arePlayersEnough = false`）。同時に CM グループの `participants` と `collectedData` を空にし、NPC に `npc_hide`、ConditionManager に `luida_reset` を送る。(2) Global の 4 値と ConditionManager の応答（グループ状態 `luida_resetAck`）を確認できたら、ParticipantManager に `luida_reset` を送る。(3) ParticipantManager が新しい sessionID で初期化し、最後に登録を再開する。応答 `luida_reset_ack` か Start で完了。以降は 1 人目と同じ流れ（登録、eligibility、Start）。
- **確認できない場合**: 各段階は確認できるまで 2 秒ごとに再送し、タイムアウトしても先へ進まない。15 秒経っても確認できなければ指示板に「エラー：実験の初期化に失敗しました。実験者にご連絡ください。」を出す。ParticipantManager の初期化が最後なので、それまで次の人は登録されない。
- **質問紙**: 各 FormController が自分のグループの sessionID の変化を見て、前の参加者の割当と送信済みの状態を消し、次の参加者に開き直す。
- **指示板**: End 中に前の参加者がもういないときは「しばらくお待ちください…」（入室から Start までの 1〜3 秒）。
- **LUIDA 本体の変更**（追加のみ。SessionReset の無いワールドでは呼ばれない）: `ParticipantManager.js` の `initSession()` と `luida_reset`、`ConditionManager.js` の `luida_reset`（`isLast` も戻す）、`FormController.js` の sessionID 変化による初期化。どれも初期化が例外なく終わってから token を保存するので、途中で失敗しても再送でやり直せる。
- **設置**: メニュー `LUIDA > Study4 > Add session reset item (keep scene)`。SessionReset が無ければ作り、参照（NPC, ConditionManager, ParticipantManager）と GlobalLogic を付け直し、退出ゲートを遠方に置き、SessionReset / ExitPortal / Instruction の動作と JS だけを書き直す。何度実行してもよい。バッチ実行は `-executeMethod Study4SceneBuilder.AddSessionResetItemFromBatch`。
- **モックテスト**: `node --test "research/study4-phantom-touch/tests/*.test.mjs"`。LUIDA の 3 スクリプトのハンドラ（途中失敗からの再送を含む）と、生成された `SessionReset.js` を実際の ConditionManager / ParticipantManager と組み合わせた一連の流れ、止まる条件を確かめる。
- **実機で確かめること**（エディタでは退室と再入室を再現できない）: 1 人目が最後まで終えて退室 → 数分以内に別アカウントで入室して最初から最後まで実施（Web Console に別の sessionID で 2 セッション分のデータと回答があること）。End のカウントダウン中に退室した場合も 1 人目のデータが残ること。2 人目のスポーン地点にゲートが無いこと。2 人目も 4 試行で SocialPresence へ進むこと。同じスペースで 3 人目。
- **既知の制約**: 送信の成功は確認しない。空のスペースがどれだけ存続するか、次の人が同じスペースに入るかは Cluster 次第（入らなければ従来どおり新しいスペースで始まる）。同じアカウントで入り直したときに前の PlayerHandle の `exists()` が true に戻る場合はリセットされない（実機で確認する）。

## 9. 質問紙は「ステートの訪問ごとに 1 回」答えられる（2026-11-08）

- 以前は `FormController.js` が送信後に `isSubmitted` を立てたまま戻さず、同じ質問紙オブジェクトは二度と開けなかった（待機画面でクリックすると質問紙が読み直される不具合への対処）。Study 4 の VEQ（qID 2）のように同じ質問紙を複数回使う実験では使えないので、制限を「同じステートの訪問につき 1 回」に変えた。
- 仕組み: 送信時に Global 信号 `state_entered` の時刻を控える。`$.onUpdate` で、その時刻が変わった（ステートマシンが次のステートに入った）ときだけ `reopenForm()` で閉じた状態に戻し、開始ヒントを再表示、待機文を消す。応答待ちの間は `state_entered` が変わらないのでクリックしても何も起きない（以前の不具合は再発しない）。コンテナはステート終了（`state_exited` → `state_isActive = false`）で非表示になるので、戻した瞬間に参加者が触れることはなく、次に同じステートに入ったとき開ける状態になっている。
- 送信の応答が返らない（通信失敗）場合は、以前と同じくそのステートに留まり、質問紙も閉じたまま。送信の確認・再送は `upload-reliability-plan.md` の範囲。
- モックテスト: `luida-reset-handlers.test.mjs` の「answered once per state visit」。

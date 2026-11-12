# Study 4（PhantomTouch）実装メモ

- 実装日: 2026-10-24（2026-10-26 更新: 挨拶期間・NPC 表示制御・笑顔・鏡・単一 VEQ ステート／手のひらの向きの修正。2026-11-04 更新: 表示されない不具合の修正、UI レイアウトの作り直し、顔を撫でる動作。2026-11-07 更新: 同じスペースで次の参加者を迎えるセッションリセット、退出ゲートを遠方へ移動。2026-11-08 更新: 身長合わせ、無反応時の頷き、30 秒の挨拶、頬を狙う接触点と手の向き、撫で方、表情のギミック化、質問紙の上の指示文、デブリーフ文、試行内報告の選択肢の更新（英語併記、「その他」の自由記述）、注意の質問を最後へ、機器（ポーズ）確認を各ブロックの着替えの後へ移し正面に鏡、着替え指示の横にアバターメニューの写真、VEQ の指示文に「あなた」、NPC の手を 1 cm 近くまで伸ばし撫でる長さを 6 cm に。2026-11-09 更新: 試行間の休憩を 10 秒に、着替えの間も鏡を表示、挨拶の指示に具体例。2026-11-08 更新: セッションリセットを「新しく入った人に確認してから」に変更し、同じアカウントの入り直しは続きから再開できるようにした（§8）。2026-11-10 更新: 触る段階の配置を変更（正面の鏡、NPC は参加者の右後ろに立ち、横から右頬へ手を近づける。指を曲げる）、NPC のボーンマップをシーンのモデルから作り直し、撫でる動作の加減速、試行中の近い鏡、部屋（§10）。2026-11-11 更新: 社会的条件を参加者内に（§11）、触る段階を正面からの配置に戻した（§12）、挨拶を具体的な指示つきに（§13））
- 設計書: `implementation-plan.md`（同フォルダ）
- 生成シーン: `Assets/_Experiment_/Scenes/PhantomTouch.unity`
- 生成手段: `Assets/_Experiment_/Editor/PhantomTouch/Study4SceneBuilder.cs`（メニュー `LUIDA > Study4 > Build PhantomTouch scene`）。LUIDA のエディタ API（シーンテンプレート、State Machine タブの生成処理、State-listening Item 生成、質問紙束縛、Data Collector、アバターラッパー生成）をそのまま呼び出しているので、生成物は LUIDA の各ウィンドウでそのまま編集できる。

## 1. 生成されたもの

| 種別 | パス | 内容 |
|---|---|---|
| シーン | `Assets/_Experiment_/Scenes/PhantomTouch.unity` | テンプレート由来の環境 + 下記すべて |
| ステート | `Assets/_Experiment_/Settings/StateList/PhantomTouch.asset` | Start（質問紙なし、OK ボタン）→ Trial - Start → Trial - PoseCheck → Trial - Greeting（時間制限なし。挨拶ガイドが終わらせる、§13） → Trial - Touch → Trial - Report → SocialPresence(qID3) → Trial - VEQ(qID2) → Trial - Rest(10 s) → PersonalExperience(qID4) → Debrief（質問紙なし、OK ボタン）→ End。Trial - Start から Trial - Rest までを試行数（4）だけ繰り返す（2026-11-11 に SocialPresence をループ内へ移した。§11） |
| 実験変数 | `Assets/_Experiment_/Settings/ExperimentVariables/PhantomTouch.js` | within: `block`=1,2（非ランダム）× `social`=with,without（ブロック内でランダム）、between: `order`=daily_first,assigned_first、Trials Count 1 → 4 試行（各条件 1 試行）。2026-11-11 までは social が参加者間、各ブロック `rep`=1,2 の 2 試行（§11） |
| 質問紙フォーム | シーン内 `LUIDA-QuestionnaireByState/<State>/Questionnaire_p1` | VEQ（qID 2）, SocialPresence（qID 3）, PersonalExperience（qID 4）。qID は Web Console 側の登録順と一致させること。Debrief の質問紙は 2026-11-04 に、Start の同意質問紙は 2026-11-08 に外した（qID はそのまま）。各コンテナは初期状態で非アクティブ（ステート開始時にギミックが有効化） |
| Data Collector | `Assets/_Experiment_/Scripts/DataCollectors/PhantomTouch.js`（Code モード、設定は `Settings/DataCollectorConfig/PhantomTouch.asset`） | 1 行のフィールド一覧は設計書 §12 |
| State-listening Items | `Assets/_Experiment_/Scripts/StateManagement/PhantomTouch/*.js` と `StateListeners/*.asset` | `Instruction`, `NpcDirector`, `AvatarGate`, `DeviceCheck`, `ReportPanel`, `MirrorPanel`, `ExitPortal`, `GreetingGuide`（§13）, `SessionReset`（§8） |
| NPC | `Assets/_Experiment_/Prefabs/PhantomTouch/NPC.prefab`（シーンに配置済み） | YoungAvatar.vrm のラッパー（モデル子オブジェクト名 `Model`。シーン上の NPC は `luida_default_avatar_02.vrm` に差し替え済み）+ `Scripts/PhantomTouch/NpcController.js` + `Avatars/PhantomTouch/Generated/NPC_BoneMap.js`（シーンのモデルから生成。胴・腕・脚・目と右手の指 15 本の計 34 ボーン、§10）+ `npc_done` を Global へ中継する GlobalLogic + 顔メッシュ `Face` の Animator（`NpcFace.controller`: Bool `joy` / Trigger `surprised`、クリップ `NpcFaceNeutral/Joy/Surprised`）と、それを NPC アイテムの状態 `npc_joy`（Bool）・信号 `npc_surprised` から動かす CCK の Set Animator Value Gimmick 2 個（§2-4） |
| ボタン | シーン内 `ReportPanelUI/RP_0..RP_10, RPW_0..RPW_7, RP_Done`, `AvatarGateUI/AG_Changed, AG_Yes, AG_No`, `DeviceCheckUI/DC_Force`, `DebriefUI/DB_Ok` | 各ボタンは Item + Interact Item Trigger（Specified Item → 親 SLI の Integer 状態）+ `Scripts/PhantomTouch/Study4Button.js`（ラベル・表示・ON/OFF） |
| 鏡 | `MirrorPanel`（SLI）配下に CCK の `Mirror.prefab` を 2 枚（`Mirror` と `MirrorFront`、どちらも 1.2 × 1.8 m、初期非アクティブ） | `Mirror`: 参加者の左前方 45°・1.3 m、参加者の方を向く（自分のアバターと、顔に触れる NPC の手が映る）。ブロックの 1 試行目の Trial - Start（着替え）で表示し、Trial - PoseCheck の間は隠して、毎試行の Trial - Greeting 開始で表示、Trial - Touch 終了で非表示。`MirrorFront`: 正面 1.6 m（中心の高さ 1.1 m）。ブロックの 1 試行目の Trial - PoseCheck の間だけ表示。配置は §7。右後ろの配置で使っていた 3 枚目 `MirrorTouch` は 2026-11-11 に削除（§12） |
| アバター変更の写真 | `AvatarGateUI/AvatarGate/MenuPhoto1`, `MenuPhoto2`（Quad、Unlit/Texture、コライダーなし、初期非アクティブ）。画像は `Assets/_Experiment_/Textures/PhantomTouch/open-menu.png`（1: メニューを開いて「アバター」）と `open-avatar-menu.png`（2: アバター変更画面で「LUIDA Default Avatar」を選び「アバターを変更」）、マテリアルは `Materials/PhantomTouch/MenuPhoto1.mat`, `MenuPhoto2.mat`。画像は 2 の累乗へ縮小せずに取り込む | 着替え指示（AvatarGate）の右隣に上から 1, 2 の順で縦に並べる（幅 0.52 m、縦横比は画像のまま）。AvatarGate が rep=1 の着替えの間だけ表示。2 は Default Avatar を選ぶ写真なので、Default Avatar のブロックでだけ出す（普段使いのブロックでは 1 だけ） |
| 身長合わせ | `HeightPlatform`（Item + `Scripts/PhantomTouch/Study4Platform.js`、立ち位置。子 `Cube` 1.6 × 1 × 1.6 m、コライダー付き）と NPC の子 `Riser`（0.8 × 1 × 0.8 m、コライダーなし） | どちらも高さ 1 m の直方体で、上面が足元（床）にあるので通常は床下に隠れ、持ち上げた分だけ床の上に出る。NPC が `platform_set { h }` で台を上げる。§2-4 |
| その他 | `FloorMarker`（Quad）、`Materials/PhantomTouch/*.mat`、`ExitPortal`（立ち位置に配置）配下に移した `WorldGateToLuidaBar`（ExitPortal から (100, 100, 100) 離れた位置に置き、End の 10 秒後に参加者をそこへテレポートする） | |

レイアウトはスポーン地点 (0,0,-2) を原点、+Z を正面として配置している。NPC は実行時に参加者の頭位置から立ち位置を再計算するので、初期位置は仮。

## 2. ランタイムの流れ（要点）

自己アバター条件（参加者内）は **Default Avatar（assigned）vs 普段使い（daily）**。Web Console の参加者アバターモードは DEFAULT（`luida_default_avatar`）で、このワールドではアバター変更メニューに「LUIDA Default Avatar」が表示される。行データの `avatar` は従来どおり `assigned` / `daily`、実験変数 `order` も `daily_first` / `assigned_first` のまま。

参加者の移動（スティック／キー操作の移動速度）は入室から 0。動けるのは `Trial - Greeting` の間（通常の速さ）と、2026-11-12 から `Trial - Touch` の間（通常の 0.1 倍。不快なときに手から後ろへ下がれるように。§14）だけ（End では退出ゲートへテレポートするので、歩く必要はない）。Start の説明文で「スティックでの移動は、必要な場面以外では止めてあります。（その場で頭や体を動かすのは自由です）」と伝える。NpcDirector の `nd_tick` が 1 秒ごとに `setMoveSpeedRate` を掛け直す（LUIDA のプレイヤースクリプトが参加者の初期化時に 1 へ戻すため）。部屋の中を実際に歩くことは止められない。

1. `Start`: 質問紙なし（同意は募集側で取る）。正面の指示板に、何をするかだけを書いた説明（条件や仮説には触れない）と、その下に「OK」ボタン（Debrief と同じ `DebriefUI/DB_Ok`）。押すと遷移（デバッグ用にステートへ Exit Time を付けてもよい）。NPC は非表示。
2. `Trial - Start`（ブロックの 1 試行目のみ。2026-11-11 以降の「rep」は §11）: NPC に `npc_setup`（マーカーの位置・向き・床の高さを渡す。前のブロックの身長合わせを解除し、足元の台を下げる）を送ってから参加者をマーカー（床の高さ）へテレポートし、NPC を非表示（`npc_hide`）にして AvatarGate が着替え指示（Default Avatar の条件では「メニューのアバター変更に表示される『LUIDA Default Avatar』に着替えてください。左の鏡に着替えたアバターが映るまで待ってから、『着替えました』を押してください」）→「着替えました」→「はい/いいえ」→ 行保存 → 遷移。rep=2 では AvatarGate が即 `ToNextState()`。着替えの間は左前方の鏡（`Mirror`）を出し、アバターの読み込みを鏡で確かめてからボタンを押してもらう。着替えの指示の間、パネルの右隣にアバター変更の手順の写真を出す（1: メニューを開く。2: アバター変更画面。2 は Default Avatar のブロックだけ）。Default Avatar の骨格値（`AG_D_ARM` / `AG_D_SHOULDER`）は未計測なので、現在は自動判定なしで「着替えました」をすぐ出し、二段階の自己申告で進める（行データ `avatarCheckFallback = true`、`avatarIsDefault = null`）。Cluster 上で Default Avatar を着て `[AvatarGate] signature …` のログ値を 2 つの定数（builder の `AvatarGateLegacy`）に入れると、骨格による一致判定（1 秒安定）が有効になる。
3. `Trial - PoseCheck`（rep=1 のみ。rep=2 は DeviceCheck アイテムが即 `ToNextState()`）: 着替えの後、NPC が現れる前に、ブロックごと（アバター条件ごと）にトラッキングとポーズを確認する。正面に鏡（`MirrorFront`）を出し、指示板は「鏡を見ながら、次の動きをしてください。1) 頭をゆっくり左右に向ける 2) 両手を額の高さに上げて、3秒そのまま」（2026-11-12 まで「両手を頭より高く上げる」）。DeviceCheck（右側の緑のパネル）が、頭を左右 25° 以上回す ＋ 両手を額の高さで 3 秒（その平均を額の高さとして NPC へ。§17）を判定する。60 秒経過で救済ボタンが出る。合格で行を保存して遷移（行データ `deviceCheckSec`, `deviceCheckForced`, `foreheadCal*`。ブロックごとに 1 行）。以前は Start の直後に 1 回だけ行っていた（ステート名 DeviceCheck）。デバッグ時はこのステートに Exit Time（数秒）を付けると自動で進む。本番では付けない。
4. `Trial - Greeting`（毎試行、その試行の社会的条件で。§11。2026-11-11 から時間制限なしの「指示つきの挨拶」、§13）: 参加者は歩いて移動できる（終了時に再び 0）。NpcDirector が `npc_show` → NPC がまず身長を合わせる: 参加者の頭ボーンの高さ（頭ボーン − 足元）と自分の頭ボーンの高さを比べ、差が 5 cm 以上なら、参加者が低いときは立ち位置の台（`HeightPlatform`）を差の分だけ上げて参加者をその上に乗せ（位置だけテレポート、向きはそのまま）、NPC が低いときは自分の足元の `Riser` に乗る（NPC の移動時は一緒に動く）。着替え直後でボーンが読めないときは最大 3 秒待って再試行し、読めなければ合わせない。次にマーカーの正面方向、会話距離（正面から手が届く位置 + 0.45 m ≈ 1.0 m）に現れる。左前方の鏡が表示される。指示板（NPC の頭上）は「目の前に赤く表示される指示に、ひとつずつ従ってください。」だけで、まず NPC から挨拶し（with 条件のみ。without では同じ時間だけ待つ）、その後、具体的な指示は GreetingGuide アイテムが参加者の顔の前の赤いパネルに 1 つずつ出す（手を振る → 顔を右に向ける → 相手の顔を見る → 右へ 1 歩 → 相手の顔を見る。§13）。5 つ終わると次のステートへ進む（社会的条件によらず同じ指示）。行データに `participantHeadH`, `npcHeadH`, `heightPlatform`, `npcLift`（m）。閾値は `NPC_CFG.HEIGHT_MATCH_MIN`。
   - social = with:
     - 視線: 頭（と目）だけで参加者を追う（頭は最大 50°、目はさらに 12°）。参加者が NPC の正面から 35° 以上ずれると体全体が補間（指数的、2.5/s）で向き直り、4° 以内で止まる。体が回るにつれ頭のローカル回転は自然に戻る。
     - 反応: 参加者が指示を 1 つ済ませるたびに GreetingGuide から合図（`npc_greet_cue`）が届き、決まった反応を返す（`NPC_CFG.GREET_REACTIONS`）: 最初の指示の前に NPC から挨拶（合図 `hello`）→ 頷き＋手振り＋笑顔、手を振った → 頷き＋手振り＋笑顔、目をそらしてからまた見た → 頷き＋笑顔、横へ動いた → 体ごと参加者の方へ向き直る（頭と目は常に追っている）、動いた先からまた見た → 手振り＋笑顔。笑顔（`Fcl_EYE_Joy`=100, `Fcl_MTH_Joy`=50）は反応の終了とともに戻る。2026-11-11 までは NPC 自身が視線と挙手を検知してランダムに反応し、5 秒無反応なら頷いていた（どちらも廃止。視線と挙手の回数は今も数えて行データに残す）。
     - 触られたとき: 参加者の手が NPC の頭・胴・腕に触れた瞬間に驚き顔（`Fcl_EYE_Surprised`=50, `Fcl_MTH_Surprised`=50）を 1 秒（1.5 秒のクールダウン）。
     - 表情は顔メッシュ `Model/Face` の Animator（`NpcFace.controller`: Bool `joy`、Trigger `surprised`）で切り替える。Cluster Script からはブレンドシェイプを直接書けない（`unityProp` で触れる SkinnedMeshRenderer のプロパティに重みは無い）ので、クリップで動かす。Animator のパラメータは、同じオブジェクトに付けた CCK の Set Animator Value Gimmick 2 個（NPC アイテムの状態 `npc_joy`（Bool）→ `joy`、信号 `npc_surprised` → `surprised`）が書き、スクリプトは `$.setStateCompat('this', 'npc_joy', …)` / `$.sendSignalCompat('this', 'npc_surprised')` を呼ぶだけ（LUIDA の「Show item」と同じ仕組みで、エディタのプレビューでも Cluster でも動く）。以前はスクリプトが `getUnityComponent('Animator').setBool` を直接呼んでいたが、NPC のモデルをシーン上で差し替えたあと新しいモデルには Animator が無く、表情が出なかった。keep-scene メニューと `LUIDA > Study4 > Rebuild NPC face animator` は、シーン上の NPC の今のモデルから 4 つのシェイプキーを持つメッシュを探して Animator とギミックを付け直す。
   - social = without: NPC は立っているだけ（注視も反応もなし）。
   - 期間終了時に `greetSec / greetGazeEvents / greetHandRaises / greetCues / greetNpcReactions / greetNpcNods / greetNpcWaves / greetNpcSmiles / greetTouches` を、GreetingGuide が `greetStepSec / greetTimeouts` を収集データへ書き込む（§13。`greetNpcIdleReactions` は 2026-11-11 に廃止）。これらの列は 2026-11-08 まで Data Collector の列一覧に入っておらず行に出ていなかった（同日に追加）。
5. `Trial - Touch`（2026-11-11 に正面からの配置へ戻した。§12）: 指示板（front 位置）は「正面の相手の手がゆっくり近づきます。顔を正面に向けたまま、楽な姿勢で見ていてください。（不快に感じたら、スティックで後ろに下がれます）」（括弧の 1 行は 2026-11-12 から。このステートの間だけスティックで遅く動ける。手は参加者を追わない。NPC が消えた後、参加者を毎回マーカーへ戻す。§14）。左前方の鏡は挨拶から出たまま。NpcDirector が `npc_trial_start`（`reset: true`）を送信。NPC は開始の瞬間に参加者の位置と向きをマーカー（初期位置。台があればその上）へ戻し、1 秒待ってから（テレポートの反映待ち）、戻った参加者の方へ向き直りながら、1 秒でマーカーの正面方向の手の届く位置（マーカーから約 0.56 m）へ前進し（頭の向きではなくマーカーの向きを使うので、参加者が鏡を見ていても正面に立つ）、prep(2 s, with 条件は注視＋会釈/手振り) → ready(1.2 s で手を肩と目標を結ぶ線上の 35% 地点へ。指は水平から 45° 上向きで真っすぐ、手のひらは目標の方向) → approach(その線に沿って 2 cm/s で、指の腹が目標の 2 cm 手前（`STOP_MARGIN`）に来るまで。経路 0.32 m、約 16 秒) → stroke(撫でる: 指の腹を顔に沿って下へ 6 cm（2 cm/s。2026-11-12 から 9 cm で、少し顔から離れる向き。§18）→ 顔から最大 3 cm 離れる弧で上へ戻る（4 cm/s）→ 再び触れる、を 3 回。各区間は 0.4 秒で加速し 0.4 秒で減速する。計 15.7 秒（9 cm にしてからは 21.4 秒、肩の上まで撫でるようにしてからはエディタのアバターで 43 秒）。手の向きは接近時のまま。弧は接近方向の逆へ膨らむ) → hold(最後の撫で終わりの位置で 1 s) → retract(関節角の補間で腕を下ろす) → 元の位置（会話距離）へ後退してから消える。目標点は、姿勢確認で測った肩の高さ + 腕の長さ ÷ 2（2026-11-12 に頬 → 目の少し上 → 額 → これ。§15、§17、§18）、参加者から見て左へ 4 cm、Head ボーンの前へ 9.5 cm（`FACE_SIDE`, `FACE_FWD`）。撫でる動作はそこから肩の 4 cm 上まで下ろす（6 cm ずつ → 腕の長さ ÷ 2 − 4 cm）。測れなければアバターの腕のボーンから、それも無ければ目ボーン + 4.5 cm（`FOREHEAD_ABOVE_EYES`）、Head ボーン + 10.8 cm（`FACE_UP`）。撫でる向きは、9 cm 下がるごとに顔から 0.9 cm 離れる（`STROKE_INWARD`）。エディタのエミュレータは目ボーンの無いアバターで `getHumanoidBonePosition` が null を返さず .NET 例外を投げ、JS の try/catch では受けられずハンドラ全体が止まる（2026-11-08 に NPC が出なくなった原因）ので、テストモードでは目ボーンを読まない（以前は Head ボーンの 5 cm 上＝目のすぐ下で、高すぎた）。撫で方は `STROKE_AMP` / `STROKE_BACK` / `STROKE_CYCLES` / `STROKE_RETURN_SPEED` / `STROKE_RAMP_SEC`（`STROKE_CYCLES` 0 で撫でない）。行データに `strokeEndTs`, `strokeAmp`, `strokeBack`, `strokeCycles`, `strokeReturnSpeed`, `strokeRampSec`（撫で始め = `contactTs`）と、そのときの `heightPlatform`, `npcLift`。消えた後に `npc_done`（Item 信号 → GlobalLogic → Global 信号）→ NpcDirector が遷移するので、報告パネルや質問紙の間 NPC はいない。120 秒の安全タイムアウトあり（このときも NPC は後退して消える）。鏡はこのステートの終了で非表示。
6. `Trial - Report`: 0–10 → （評定≥1 のみ）感覚の種類（複数）→ 部位（複数）→ 操作チェック 1–7（相手に注意を向けられたと感じたか。2026-11-08 から最後に回した）→ 行保存 → 遷移。数字は `RP_*`（4 × 3）、種類と部位は幅の広い `RPW_*`（2 × 4）に出す。
   - 種類（`ptype`）: 1 触れられた感じ（Touch）/ 2 圧迫感（Pressure）/ 3 温かさ / 4 冷たさ / 5 ピリピリ・チクチク・しびれ（Tingling）/ 6 くすぐったさ・かゆみ / 7 風が通る感じ / 8 その他。
   - 部位（`ploc`）: 1 額 / 2 目・目のまわり / 3 頬 / 4 鼻・鼻のまわり / 5 唇・口のまわり / 6 あご / 7 頭の側面・耳 / 8 その他。場所が分からない人は「その他」を選ぶ想定。
   - 値は選んだ番号を昇順に `,` でつないだ文字列（例 `1,5`）。評定 0 の行は空。2026-11-08 に選択肢を入れ替えたので、それより前のテストデータとは番号の意味が違う。
   - 「その他」を含めて「決定」を押すと、Cluster の文字入力（`requestTextInput`）が開く。入力した文字列は改行を空白に置き換えて `ptypeOther` / `plocOther` に入る。入力を閉じるか、1.5 秒以上たってからもう一度「決定」を押すと、空のまま次へ進む。入力できない状態（Busy）なら 2 秒ごとに最大 5 回まで開き直す。
7. `Trial - VEQ`: NpcDirector が試行のブロック内の位置を見て、各ブロックの最後の試行以外は即 `ToNextState()`。該当時は質問紙の上に「あなたがいま使っているアバター（問題文では「仮想身体」と表現されていることがあります）について伺います。」（3 行）を出し（相手のアバターではなく、参加者自身のアバターについて聞いていることをはっきりさせる）、質問紙（VEQ, qID 2）の完了で遷移（NPC は触る段階の終わりに消えている）。ブロック 1・2 の回答は同じ qID に保存されるので、時刻順で区別する。
8. `SocialPresence`（2026-11-11 から毎試行、Trial - Report の直後。§11）(qID 3、質問紙の上に「あなたの顔に触れてきた相手についてのアンケートです。」) → `PersonalExperience`(qID 4、「最後のアンケートです。」) → `Debrief`: 正面の指示板にデブリーフ文（感謝 → 調べていたこと: ファントムセンス（VR感覚・V感）のうち、誰かに触れられたと感じるファントムタッチ錯覚が、相手の反応や自分のアバターに影響されるか → その錯覚の説明 → 条件（相手の社会的な反応の有無 × 普段使いのアバターかどうか）→「【お願い】」に続けて、今月中は内容と条件を他言しないお願い → OK の案内。13 行、文字 0.022）、その下に「OK」ボタン（`DebriefUI/DB_Ok`、Instruction アイテムの Integer 状態 `ins_btn` に書く）。押すと `End` へ。
9. `End`: データを 1 回アップロード。指示板に「あと N 秒で募集ワールドへ移動します」（10 秒のカウントダウン）を出し、0 になった時点で ExitPortal が退出ゲート（CCK World Gate）を有効にして、参加者をそのゲートへテレポートする。ゲートはスポーン地点から遠い位置（ExitPortal のローカル座標 (100, 100, 100)）にあり、ParticipantManager が参加拒否のときに使う方式と同じ。World Gate は触れた瞬間に移動させるので、カウントダウンの後に有効にしている（秒数は builder の `EndGateDelaySec`）。以前は参加者の足元に出していたが、それだとゲートがスポーン地点に残り、同じスペースに次に入った人がすぐ送り返されていた。参加者が退室した後の流れは §8。

## 3. 残作業・確認事項（優先順）

1. Web Console（手動）: 実験作成（定員 1、Allowed platforms = VR、Participant Avatar = DEFAULT）、質問紙 qID 1–4（Start の同意、VEQ、SocialPresence、PersonalExperience）をこの順に登録、実験 ID を `LUIDA > Configure experiment identifiers` に設定、ワールド ID 登録。
2. テスト（設計書 §16）: T2（Default Avatar の骨格値 `AG_D_ARM`/`AG_D_SHOULDER` を実測して設定。未設定の間は自己申告のみ）、T3、T4（2 cm/s・停止位置・身長差）、T5、T6、T7（Custom Log 7 行・100 kB 未満）、T8、T10。
3. 文言・レイアウト調整: 文言は `Study4SceneBuilder.cs` の `InstructionListeners` と各 Legacy code（`AvatarGateLegacy`, `DeviceCheckLegacy`, `ReportPanelLegacy`）、配置・文字サイズ・背景色は §3b の定数と `ApplyLayout`（§7）。変更後はメニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)`（UI の配置のほか、`HeightPlatform` と NPC の `Riser` が無ければ作り、GreetingGuide アイテムが無ければ作り、`Trial - Greeting` の Exit Time を外し、アイテムの動作と JS を書き直す）。NPC の距離・反応の閾値は `NpcController.js` 冒頭の `NPC_CFG`（`IDLE_EXTRA_DIST`, `LOOK_AT_DEG`, `HAND_RAISE_OFFSET`, `GREET_REACTIONS`, `HEIGHT_MATCH_MIN`、目標点の `CHEEK_BELOW_EYES` / `FACE_SIDE` / `FACE_FWD`、手の `HAND_PITCH_DEG` / `CONTACT_LEN`、撫で方の `STROKE_*` など）。
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

接触判定に使う点は指の腹（手首から指方向 12 cm（`CONTACT_LEN`）、手のひら側へ 1.5 cm（`PALM_OFF`））。指先はそこから約 3 cm 先で、目標点のほぼ上（約 1 mm 手前）で止まる。手首の反りは約 21°、肘の曲がりは約 49°（オフライン検証 `sim_stroke.js`）。値は `NPC_CFG` の `READY_FRAC`, `HAND_PITCH_DEG`, `CONTACT_LEN`, `PALM_OFF` で調整できる。

指は真っすぐ。ボーンマップには右手の指ボーン 15 本が入っている（§10）ので、毎フレーム手と同じ回転を与えて手に追従させる（`R_FINGER_BONES`）。右後ろの配置で使っていた指の曲げ（`FINGER_CURL`）と、曲げた指に合わせた接触点の計算は、ブランチ `hao/phantom-touch-npc-behind` にある（§12）。

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
| Trial - PoseCheck（ブロックの 1 試行目） | 正面の鏡（`MirrorFront`。上端は front 位置の 3 行の文字の下端 +19° より下。文字より奥にあるので文字を隠さない） | ±21° / −40〜+16° / 1.6 m |
| Trial - Report | ReportPanel（茶、正面。NPC は非表示） | ±19° / −32〜+5° / 1.25 m |
| Trial - Start（ブロックの 1 試行目）、Trial - Greeting と Trial - Touch（毎試行） | 左前方の鏡（`Mirror`） | −20〜−70° / −41〜+21° / 1.3 m |
| Trial - Greeting | 挨拶ガイドの赤いパネル（参加者の頭の向きに合わせて実行時に置く。文字 0.014、1 文字約 2.1°） | 頭の正面 ±16° / 視線の約 10° 下 / 0.7 m |

- **文字**: CCK の TextView では全角 1 文字の幅が size × 1.85、行の高さが size × 2.74（実測）。指示板 0.024（1.5 m で 1 文字約 1.7°）、パネル 0.018（1.25 m で約 1.5°）。1 行の長さは場所ごとの空きに合わせた（全角換算）: front（NPC の頭上、隣に鏡）20 字、above（質問紙の上）26 字、center 26 字（デブリーフは 30 字）、AvatarGate と ReportPanel（正面）24 字。パネルの文字は下端を基準に上へ伸びるので、行数が増えてもボタンに重ならない。
- **背景**: 文字ごとに半透明の色板（Standard / Fade、文字より先に描画する render queue 2990、コライダーなし）。指示板は紺、AvatarGate は紫、DeviceCheck は緑、ReportPanel は茶。背景は各 `Text` の子なので、文字と一緒に表示・非表示になる。指示板の背景は 1 枚（`Bg`）で、`ins_show` が行数と最長行の文字数から大きさを計算し、`getUnityComponent('Transform').unityProp.localScale` で合わせる。
- **指示板の移動**: Instruction アイテムは立ち位置に置き、`ins_show(slot, text, size?)` が `Text` サブノードを front（NPC の頭上）/ above（質問紙の上）/ center（正面）に移し、文字サイズも切り替える（`SubNode.setPosition/setRotation/setTextSize`）。Start は center に課題の説明だけ（条件・仮説なし）と OK ボタン。質問紙のあるステートの文言: VEQ「あなたがいま使っているアバター（問題文では「仮想身体」と表現されていることがあります）について伺います。」、SocialPresence「あなたの顔に触れてきた相手についてのアンケートです。」、PersonalExperience「最後のアンケートです。」。
- **ボタン**: 報告パネルの数字は 4 列 × 3 行（0〜10 を左上から順に、0.16 × 0.10 m）。種類と部位は別の 2 列 × 4 行のボタン（0.38 × 0.115 m、上端は数字の格子と同じ高さ）で、ラベルは問題文と同じ 0.018（1 行全角 10 字まで、2 行まで）。その下に「決定」。ラベルの文字サイズは `Study4Button.js` がボタンに収まるように決める（`btn_cfg` の `fit`）。AvatarGate の「着替えました」と「はい/いいえ」は別の行（連打で確認を飛ばさないように）。
- **NPC と質問紙**: 会話距離の NPC は質問紙の手前に立ってしまうので、毎回の触る段階の終わりに元の位置へ戻ってから消える（§2-5）。
- **反映方法**: メニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)`。上記の 5 つのルート（Instruction, AvatarGateUI, DeviceCheckUI, ReportPanelUI, MirrorPanel）の配置・文字サイズ・背景だけを変え、続けてアイテムの動作を書き直す。ステートリストなど他の設定には触れない。フルビルドも同じ `ApplyLayout` を使う。
- **ステートの並べ替え（2026-11-08）**: メニュー `LUIDA > Study4 > Move the pose check into the trials (keep scene)` が、ステートリストの DeviceCheck を `Trial - PoseCheck` に改名して `Trial - Start` の直後へ移し、実験変数 JS の `state_names` と既存のステートオブジェクト（並び順、各 Transition のステート ID・遷移先・Exit Time、Trial - Rest の戻り先）を合わせてから、上のメニューと同じ更新を行う。LUIDA の State Machine タブの再生成は質問紙フォームも作り直すので使わない。2 回目以降の実行では並べ替えずに ID だけ合わせ直す。

## 8. セッションリセット: 新しく入った人に確認してから（2026-11-08。2026-11-07 の End 後の自動リセットを置き換え）

セッションが使われているインスタンス（Start 以降。End 到達後も途中離脱後も）に、登録済みの参加者が誰もいない状態で未登録の人が入ると、LUIDA の ParticipantManager（PM）がその人に確認してからワールドを初期状態に戻す。設計と確認した事実は `session-reset-prompt-plan.md`（前の自動リセットの設計は `session-reset-plan.md`）。送信成功の確認と再送は範囲外のまま（`upload-reliability-plan.md`）。

- **いつ・どう出すか**: PM が 1 秒ごとに在室者を見る。登録済みの参加者が誰も残っていない（`exists()` が false で、同じ入室 id の人もいない）かつ未登録の人がいると、3 秒後にその人の正面 0.5 m・頭の高さに小さな赤いパネル（PM プレハブの `NewParticipantPrompt`。0.7 × 0.4 m、白い文字 size 0.015）を出す。文言は「中断または終了したセッションに入ったようです。「OK」を押して実験を最初から始めてください。」と英文（`NR_TEXT_ASK`）。その下にオレンジの「OK」。（大きさ・位置・文言は 2026-11-09 にユーザが LUIDA-ExpManagers のオーバーライドで決めた値。PM プレハブ本体とコードもこれに合わせた）相手が 1 m 以上離れたら置き直す。押されるまで何も変えない。相手が去ればパネルは消え、次に入った人にまた出す。（2026-11-09: 1.2 m 先の「あなたは新しく入った参加者ですか？」「はい」から変更）
- **「OK」**（PM の `$.onInteract`）: 自アイテム信号 `exp_sessionReset` → PM プレハブの GlobalLogic 5 個が Global を戻す（`state_exited`、`state_currentID = 0`、`exp_trialID = 0`、`exp_readyToLeaveTrials = false`、`exp_arePlayersEnough = false`）。同時に ConditionManager（CM）へ `luida_reset`。Global の 4 値と CM の返信 `luida_reset_ack` を確認してから PM 自身を `initSession()` で戻す（新しい sessionID、最後に登録再開）。確認できなければ 2 秒ごとに再送し、15 秒でパネルに「エラー：実験の初期化に失敗しました。実験者にご連絡ください。」（英文付き）。進まない。以降は 1 人目と同じ流れ（登録 → eligibility → Start）。
- **「続きから / Resume」**（`LUIDA-ExpManagers` 配下の別アイテム `NewParticipantPromptNo`。「OK」の下、0.3 × 0.05 m。パネルと同じ赤の帯 0.7 × 0.05 m を一緒に出してパネルを下に伸ばす）: 登録済みの参加者と同じアカウント（idfc）で入り直した人にだけ出す。そのときの文言は「中断したセッションに戻ってきたようです。「OK」で最初から、「続きから」で再開します。」（`NR_TEXT_ASK_RESUME`）。押すと、その人を前の参加者の枠に結び直す（PM グループと CM グループの `participants`、PlayerScript、各質問紙の `participant`）。リセットしない。位置はスポーン地点のまま、開いていた質問紙は閉じて最初から、Touch の途中なら NPC は止まっていて 120 秒で先に進む。
- **捨てるもの**: 途中離脱した人の未送信行（DataCollector が CM グループの sessionID の変化で捨てる）と、CM グループの寄せ集め値 `collectedData`（CM が `luida_participants_info` で sessionID が変わったときに空にする。途中ステートの exit アクションより後なので競合しない）。
- **途中ステートからのリセットで残るもの**: Exit Time のタイマーは `state_isActive` を見てから遷移するので残っても無害。`ToNextState()` も `state_isActive` で無効（直前 0.2 秒のものだけ例外）。during アクションは Start が来るまで動くが表示の更新だけ。NPC と鏡は Start で隠す（下記）。
- **LUIDA 本体の変更**: `ParticipantManager.js`（`nr_*`、`luida_prompt_no` / `luida_reset_ack` の受信、`participantIdfcs`。文言は `NR_TEXT_*`）、新規 `NewParticipantPromptNo.js`、`ConditionManager.js`（返信、`collectedData`、`luida_rebind_participant`）、`CustomDataUploader.js`（未送信行の破棄）、`FormController.js`（結び直し）。プレハブ: `ParticipantManager.prefab` にパネル（`NewParticipantPrompt` / `NewParticipantPromptBack` / `NewParticipantPromptText` / `NewParticipantPromptOk`。初期非アクティブ、既定位置はローカル (0, 1.4, 1.2)）と GlobalLogic 5 個、`LUIDA-ExpManagers.prefab` に `NewParticipantPromptNo`（Item + MovableItem + ScriptableItem）と PM の参照、マテリアル `NewParticipantPromptPanel`（赤）/ `NewParticipantPromptButton`（オレンジ）。組み込みは `research/study4-phantom-touch/tools/InstallNewParticipantPrompt.cs`（Unity MCP の `execute_code` で実行。冪等。大きさ・色・文言の初期値もここ）。プレハブのサブノードが無い既存ワールドでは何も起きない。
- **シーン側（2026-11-08）**: 旧 `SessionReset` アイテム（自動リセット）と生成物、builder の設置メニューを削除。残すと End 後に自動でリセットしてしまう。NpcDirector の Start で `npc_hide`（NPC を隠し、台も下げる）、MirrorPanel の Start で両方の鏡を隠す。NpcController の `participant()` は登録参加者が退室済みなら傍観者に切り替えない。Instruction の End 文言から旧 `luida_resetStatus` の分岐を削除（前の参加者がいなければ「しばらくお待ちください…」）。
- **確認**: プレハブモードで `NewParticipantPrompt` をアクティブにして文字の大きさと向きを見る（WaitingMessage と同じ向き。逆なら PM.js の `nr_place` で 180° 回す）。モックテスト `node --test "research/study4-phantom-touch/tests/*.test.mjs"`（`session-reset-prompt.test.mjs` が確認・リセット・結び直し・破棄を扱う）。実機テストは計画 §6.3（R1〜R8。同じアカウントの入り直し、途中離脱、押さずに退室、実験者の入室、不達）。
- **既知の制約**: 送信の成功は確認しない。空のスペースの存続時間と振り分けは Cluster 次第。保存した PlayerHandle の `id` / `exists()` が再開後も使えることを前提にしている（使えなければ「誰か入れば必ず聞く」側に倒れる）。

## 9. 質問紙は「ステートの訪問ごとに 1 回」答えられる（2026-11-08）

- 以前は `FormController.js` が送信後に `isSubmitted` を立てたまま戻さず、同じ質問紙オブジェクトは二度と開けなかった（待機画面でクリックすると質問紙が読み直される不具合への対処）。Study 4 の VEQ（qID 2）のように同じ質問紙を複数回使う実験では使えないので、制限を「同じステートの訪問につき 1 回」に変えた。
- 仕組み: 送信時に Global 信号 `state_entered` の時刻を控える。`$.onUpdate` で、その時刻が変わった（ステートマシンが次のステートに入った）ときだけ `reopenForm()` で閉じた状態に戻し、開始ヒントを再表示、待機文を消す。応答待ちの間は `state_entered` が変わらないのでクリックしても何も起きない（以前の不具合は再発しない）。コンテナはステート終了（`state_exited` → `state_isActive = false`）で非表示になるので、戻した瞬間に参加者が触れることはなく、次に同じステートに入ったとき開ける状態になっている。
- 送信の応答が返らない（通信失敗）場合は、以前と同じくそのステートに留まり、質問紙も閉じたまま。送信の確認・再送は `upload-reliability-plan.md` の範囲。
- モックテスト: `luida-reset-handlers.test.mjs` の「answered once per state visit」。

## 10. 触る段階の配置: 正面の鏡、右後ろから右頬へ、指を曲げる（2026-11-10。このブランチでは 2026-11-11 に正面からの配置へ戻した、§12）

> この節の配置（NPC が右後ろに立つ、正面の近い鏡、指を曲げる、右斜め前から接近）は、ブランチ `hao/phantom-touch-npc-behind` に残してある。このブランチに残っているのは、ボーンマップの作り直し、撫でる動作の加減速と戻りの弧、後ずさりの符号の修正、部屋。それ以外は §12 のとおり元に戻した。

参考: `phantom-touch-exp-references/`（実験者が参加者の右後ろに立ち、右手を参加者の右側から顔の前へ回して右目〜頬に触れる。参加者は正面の鏡で両者のアバターと触れられている自分を見る。一人称の画像では手は右から入り、人差し指を左へ伸ばし、ほかの指を曲げ、手のひらは顔の方、親指は上）。

- **挨拶は従来どおり**: Trial - Greeting は向かい合って行い、左前方の鏡を出す。Trial - Touch に入った瞬間に NPC は正面から消え、参加者をマーカーへ戻したあと右後ろに現れる（§2-5）。
- **鏡**: Trial - Touch の間は正面の鏡（`MirrorFront`）、左前方の鏡は rep=1 の Trial - Start と Trial - Greeting だけ（`MirrorPanelListeners`）。正面の鏡は指示板「front」位置の文字（1.5 m）より奥（1.6 m）で、上端（+16°）は 3 行の文字の下端（+19°）より下なので、文字を隠さない（エディタのプレイで参加者の目の位置から確認）。
- **立ち位置**: `standPose` を挨拶用（`greetStandPose`、従来の計算そのまま）と触る段階用（`touchStandPose`）に分けた。触る段階では、方位 125° の線上で、右手首が接近の終点（接触点が右頬の 2 cm 手前、横向きの手）に `(上腕 + 前腕) × 0.93` で届くいちばん遠い距離を二分法で求める（最小 0.30 m）。エディタの透明アバター（頭ボーン 1.494 m、NPC は 6 cm のライザー）では 0.40 m、会話距離は 0.85 m。
- **接近**: 参加者の頭の向き（水平）を基準に、目標から右へ 30 cm・前へ 5 cm の点から目標へ向かう直線。経路 0.284 m、14.2 秒（従来の正面からは約 16 秒）。手は頭の真横から近づくので、HMD の視野にはほぼ最後の数 cm で入り、それまでは鏡で見える。撫でる途中で顔から引く向きは、接近方向ではなく手のひらの法線の逆。retract は接近の直線を戻ってから腕を下ろす（関節角の補間だけだと手が参加者の肩を横切るため）。
- **指**: §5。指ボーンを動かすにはボーンマップに指ボーンが要る（下記）。
- **ボーンマップの作り直し**: 従来の `NPC_BoneMap.js` は YoungAvatar.vrm から作られ、休止姿勢の回転がすべて単位回転だった。シーンの NPC は `luida_default_avatar_02.vrm` に差し替えられており、こちらは胸 −7°、UpperChest −19.4°（x 軸）、肩 ∓8.1°（z 軸）、目 ±21.8°（y 軸）など単位回転でない。UpperChest はボーンマップに無いので、その休止回転（胸に対して −12.4°）が腕全体に掛かり、描画された手首は IK の手首から **9.4 cm** ずれていた（エディタで接触時に計測。`[NPC] contact: … wristErr=`）。新しいメニュー `LUIDA > Study4 > Regenerate NPC bone map from the scene model`（`WriteNpcBoneMap`）が、シーンの NPC の今のモデルから、胴・腕・脚・目（従来の 19 本）と右手の指 15 本の休止回転・親の休止回転を取り、BONE_PARENT を「いちばん近い一覧内の祖先」にして書き出す。作り直した後のずれは 1〜3 mm（social 条件では体の前傾と呼吸の分で 7 mm）。NPC の姿勢全体（背骨の反り、肩、目の向き）もモデル本来の休止姿勢に合うようになった。フルビルド（`BuildNpc`）も同じ関数を使う。NPC のモデルを差し替えたら、このメニューを実行し直すこと。
- **NPC プレハブとの関係**: `NPC.prefab` のモデルは YoungAvatar のままで、シーンのインスタンスだけが `luida_default_avatar_02.vrm`。ボーンマップのファイルは両者で共有されるので、シーンのモデルに合わせると、プレハブ単体（シーン外で使う場合）とは合わない。
- **行データ**: `npcStandAz`（触る段階の立ち位置の方位、°）、`touchSide`（`right`）、`fingerCurl`（例 `T0-10-10 I5-15-10 M25-35-20 R35-45-25 L45-50-30`、指ボーンが無ければ `none`）を追加。`handStart` は接近開始時の接触点（曲げた指の腹）。
- **後ずさりの推定の符号を修正**: `retreatDist` / `retreatOnsetDist` は、手が近づく向き（手 → 顔、水平）に頭が動いた量を「手から離れる」として数えるべきところ、逆向き（手の方へ近づく量）を数えていた。2026-11-10 から `away = +dot(delta, axis)`。それより前の行のこの 2 列は、手の方へ動いた量として読む必要がある。
- **視線の判定**: 触る段階の `lookedAtNpc`（prep と approach で参加者が NPC を見たか）は、NPC の頭を直接見たときだけ数える。NPC は後ろにいるので、振り返らない限り false になり、with 条件では prep の終わりに NPC が必ず一度挨拶する（従来、参加者が見ていなかった場合と同じ動き）。鏡に映った NPC を見たことは数えない（鏡の中の NPC は参加者自身の像から約 8° しか離れず、頭の向きでは区別できないため）。
- **確認方法（エディタ）**: プレイ中に、LUIDA のステートは任意のステート連動アイテムの Item 信号 `state_triggerTransition` で 1 つ進められる（CCK の `Bootstrap.RoomStateRepository` と `GimmickManager.OnStateUpdated`）。エディタの参加者は透明アバターなので、見た目の確認には同じ位置に別の VRM を置いた。
- **同日の追加調整（2 回目）**:
  - **撫でる速度**: 撫でる動作の各区間（下へ撫でる・引く・上へ戻る・再び触れる）を、静止から 0.4 秒で加速 → 一定速度 → 0.4 秒で減速して静止、にした（`STROKE_RAMP_SEC`。0 で従来の等速）。一定速度は従来どおり下向き 2 cm/s、戻り 4 cm/s。その分だけ時間が延び、撫でる時間は計 15 秒 → 18.6 秒（下向き 1 回 3.4 秒）。行データに `strokeRampSec` を追加。接近（2 cm/s の等速）は変えていない。
  - **試行中の鏡を 1.3 m・小さめに（2026-11-11）**: HMD 単機（Quest）では、Cluster の鏡に 2 つの制限がある（CCK の `Mirror.cs`、`CLUSTER_QUEST`）。(1) 目と鏡の面の距離が `stereoConvergence × 0.1`（Unity の既定値 10 なら 1 m）より近いと、アバターだけを描く軽量モードになり、NPC（アイテム）や部屋が映らない。1.0 m の鏡では目が 1 m 以内に入っていたので、これが原因。(2) 鏡のテクスチャは鏡全体で最大 768 × 768 なので、大きい鏡ほど粗い。そこで `MirrorTouch` を 1.3 m（前に一歩出たり前かがみになっても 1 m を切らない）、0.9 × 0.95 m（下端 0.8 m・上端 1.75 m。足元から頭の上まで映る）にした。1 度あたりの画素は約 10 → 19（Quest 2 の画面とほぼ同じ）。鏡の像までの距離は 2.6 m になる（1.0 m のときは 2.0 m）。指示文の「touch」位置は鏡に合わせて自動で動く（文字 0.0203、高さ 1.89 m）。左前方とポーズ確認の鏡（1.2 × 1.8 m、1.3 m と 1.6 m）は変えていないので、Quest では同じように粗い。stereoConvergence の値は Cluster アプリ側の設定で、実機では未確認。
  - **右斜め前から接近、終点を少し顔に近く（2026-11-11）**: 接近の始点を、目標から参加者の右へ 24.6 cm・前へ 17.2 cm・下へ 6 cm（`APPROACH_SIDE` / `APPROACH_FWD` / `APPROACH_UP`。水平には 0.30 m で、真横から前へ 35°）にした。手は右斜め前のやや下から顔へ直線で近づく。経路 0.286 m、2 cm/s で 14.3 秒（以前と同じ）。参加者の視野には以前より早く入る。終点は `FACE_FWD` 0.115 → 0.095（接触点は目標の 2 cm 手前なので、顔の前約 10.6 cm・正中の右約 1.6 cm。以前より約 1 cm 顔に近い）。右後ろ 125° からでは腕が始点に届かない（必要な距離が腕の長さの 1.03〜1.2 倍）ので、NPC の立つ方位を 110°（真横より 20° 後ろ）にし、立ち位置の計算に始点の条件を加えた: 終点の手首が腕の長さの 0.88 倍（`TOUCH_STAND_FACTOR`）以内になるいちばん遠い距離から、始点の手首が 0.92 倍（`TOUCH_START_FACTOR`）以内になるまで近づく（最小 0.30 m）。エディタでは 0.34 m、`reachable=true`。
  - **試行中の鏡を参加者の身長に合わせる（2026-11-11）**: 固定の 0.8〜1.75 m では、背の高いアバターの頭が切れる。平面鏡では高さ y の点が鏡の (目の高さ + y) / 2 の位置に映る（距離によらない）ので、Trial - Touch の開始時に MirrorPanel アイテム（`mp_fitTouch`、builder の `MirrorPanelLegacy`）が参加者の Head ボーンと足元の高さを読み、鏡の下端を (目 + 床) / 2 − 5 cm、上端を (目 + 頭頂) / 2 + 5 cm にする（目 = Head ボーン + 7 cm、頭頂 = Head ボーン + 22 cm）。NPC は床かライザーの上に立ち、頭の高さは参加者に合わせてあるので、同じ範囲に収まる。幅 0.9 m、距離 1.3 m は固定。範囲は 0.3〜2.1 m（`TouchMirrorMinBottom` / `TouchMirrorMaxTop`）。ボーンが読めない間は毎フレーム再試行し、それまではシーンの既定（0.8〜1.75 m）。高さは `SubNode.setPosition`、大きさは `getUnityComponent('Transform').unityProp.localScale`（指示板の背景と同じ方法）。ログ `[MirrorPanel] touch mirror 0.73..1.69 m`（エディタの透明アバター）。目安: 身長 1.9 m 前後で 0.88〜1.95 m（縦 約 16 px/deg）、2.0 m で 0.93〜2.05 m。2.4 m 級では上端 2.1 m で頭が切れる。指示文の「touch」位置は、鏡がいちばん高くなったときの上端（2.1 m）の上に固定した（文字の中心 2.24 m、目の高さ 1.55 m から見て約 28° 上）。距離 1.3 m（Quest でアバター以外が消えない距離）は変えていない。
  - **手の終点を前・上・正面寄りに、NPC を近くに（2026-11-11）**: 目標点を正中（`FACE_SIDE` 0.015 → 0）、Head ボーンの 4 cm 上（`FACE_UP` 0.02 → 0.04。目ボーンを使う本番では目の 2.5 cm 下、`CHEEK_BELOW_EYES` 0.045 → 0.025）、前へ 11.5 cm（`FACE_FWD` 0.09 → 0.115。顔の表面より少し前）にした。手は右から来て 2 cm 手前で止まるので、曲げた指の接触点は正中の約 2 cm 右、右目の下〜鼻の横の前で止まり、手は右目の前を覆う（参考画像に近い）。触る段階の立ち位置は、腕を伸ばし切らないように新しい `TOUCH_STAND_FACTOR` 0.88（挨拶の距離は従来の `STAND_FACTOR` 0.93 のまま）で求める。エディタでは最小距離 0.30 m（`TOUCH_MIN_STAND_DIST`）で止まり（以前は 0.36 m）、そこからでも届く（`reachable=true`、手首の誤差 3 mm）。
  - **戻りの軌跡を曲線に（3 回目）**: 撫で終わりから次の撫で始めへの戻りは、以前の「引く → 上がる → 近づく」の 3 直線（四角い軌跡）をやめ、1 本の弧にした: 下端で顔から離れ、途中で顔から最大 3 cm（`STROKE_BACK`）まで膨らみ、上端で顔に戻る半楕円（撫でる長さ 6 cm・膨らみ 3 cm なので半径 3 cm の半円、長さ 9.4 cm）。弧に沿って 4 cm/s（`STROKE_RETURN_SPEED`）、始めと終わりは 0.4 秒の加減速。戻り 1 回は 2.76 秒で、撫でる時間は計 15.7 秒（下向き 3.4 秒 × 3 + 戻り 2.76 秒 × 2）。上の「18.6 秒」は 3 直線だったときの値。
  - **試行中の鏡を近くに**: Trial - Touch では 3 枚目の鏡 `MirrorTouch`（正面 1.0 m、1.2 × 1.8 m、中心の高さ 1.05 m）を出す。`MirrorFront`（1.6 m）は PoseCheck 専用に戻した。鏡が指示板「front」位置（1.5 m）より手前に来るので、Touch の指示文は専用の「touch」位置に出す: 鏡の面の 3 cm 手前、背景の下端が鏡の上端の 3 cm 上（中心の高さ 2.07 m、仰角約 28°）、文字は 0.0155（front 位置と同じ見かけの大きさ）。鏡より手前かつ上なので、目の高さによらず鏡に隠れず、鏡にも映り込まない。
  - **接触点を顔の中央寄りに**: `FACE_SIDE` 0.04 → 0.015（正中から右へ 1.5 cm。手は右から来て 2 cm 手前で止まるので、接触点は正中から約 3.5 cm）。手のひらの向きも正面寄りに（`HAND_ACROSS_YAW_DEG` 30 → 20）。立ち位置は自動で再計算され、エディタでは 0.36 m。
  - **部屋**: ルート `Room`（メニュー `LUIDA > Study4 > Build room (keep scene)`、`BuildRoom`。フルビルドにも入れた）。5 × 5 × 2.9 m、参加者の前 2.9 m・後ろ 1.9 m・左右 2.35 m に壁。Unity Asset Store の Apartment Kit（Brick Project Studio、無料）のうち、壁・天井・巾木のモデル 3 つと、テクスチャ 2 枚（壁と天井のアトラス、床の板張り）だけを、元のパスと GUID のまま `Assets/Brick Project Studio/` に入れた（計 5.5 MB、スクリプトなし）。キットは 2.5 m グリッド・高さ 4 m なので、高さ方向に 0.725 倍、巾木は 7 cm に縮めている。床はクアッド 1 枚で、テンプレートの床（`Environment/Plane`）は描画だけ切った（コライダーはそのまま）。壁には BoxCollider。
    - 負荷（HMD 単機を想定。鏡が部屋をもう一度描く）: マテリアル 3 つ（`RoomWall` / `RoomFloor` / `RoomBaseboard`）、法線マップなし、影なし、ライトやプローブの追加なし、テクスチャは 512 と 1024 に制限、21 オブジェクトを静的バッチ。明るさの大半はエミッション（`RoomGlow` = 0.8）で、シーンのライトと環境光に反応するのは `RoomLit` = 0.3 の分だけ（ライトの設定によらずほぼ均一に明るい）。ライトマップは焼いていない。
    - ライセンス: Asset Store の標準 EULA。成果物（ワールド）に含めるのは可だが、アセットそのものを公開リポジトリに置くのは不可なので、`Assets/Brick Project Studio/` を公開リポジトリへ push しないこと。ファイルが無い環境では `BuildRoom` は警告を出して何もしない。
    - 作り込んでいないもの: 参考画像 2 のクローゼットの扉と柱、ドア、照明器具。
- **未対応・既知の点**:
  - NPC が参加者に近い（約 0.4 m）ので、NPC の `Riser`（0.8 m 角、NPC が低いとき）は参加者の足元に一部重なり、参加者の `HeightPlatform`（1.6 m 角、参加者が低いとき）は NPC の足元を含む（NPC の足が台に埋まる。従来の正面約 0.5 m でも同じ）。どちらも見た目だけの問題。台を小さくすると挨拶の間に歩いたとき台から落ちやすくなるので、変えていない。
  - 撫でる下端（頬から 6 cm 下）はあごの辺りになる（`STROKE_AMP`）。

## 11. 社会的条件を参加者内に（2026-11-11）

- **計画**: 社会的条件（with / without）を参加者間から参加者内へ。アバター条件のブロック（`block`、順序は参加者間の `order`）ごとに with と without を 1 試行ずつ、ブロック内の順序はランダム（LUIDA の within 変数 `social`、`isRandom: true`。非ランダムの変数が外側になり、ランダムの変数はブロックごとに並べ替えられる）。計 4 試行（各条件 1 試行）。以前は social が参加者間で、各ブロック 2 試行（`rep`=1,2）。
- **挨拶**: 毎試行、その試行の社会的条件で行う（当初は 20 秒固定。同日中に時間制限なしの指示つきの挨拶に変えた、§13）。身長合わせは毎試行やり直す（同じアバターなので結果は同じ）。
- **SocialPresence**: Trial - Report の直後（ループ内）で毎試行答える（質問紙は「ステートの訪問ごとに 1 回」答えられる、§9）。行は試行ごとに `cond.social` と `cond.block` で区別できる。
- **アバター着替え・ポーズ確認・VEQ**: ブロックごと（着替えとポーズ確認はブロックの 1 試行目、VEQ はブロックの最後の試行の後）。
- **「rep」の置き換え**: 試行のブロック内の位置は、Global の Integer `exp_trialID`（0 始まりの試行番号、Trial - Start に入った時点で更新済み）から求める（`trialInBlock()` = `exp_trialID % 2 + 1`、`firstTrialOfBlock()`, `lastTrialOfBlock()`。builder の `BlockTrialJs` を各アイテムのコードに入れている）。NPC の行データの `npcRep` はこの値。
- **反映**: メニュー `LUIDA > Study4 > Make social within-subject (keep scene)`。ステートリストを新しい順序に並べ替え（各ステートの Exit Time などはそのまま）、実験変数 JS を書き直し、ステートオブジェクトの並びと遷移（現在・遷移先・Exit Time・Trial - Rest から Trial - Start への戻り）を番号ごと合わせてから、レイアウトとアイテムの動作を更新する。質問紙フォームは作り直さない。エディタで 2 試行通して確認（1 試行目 without、2 試行目 with、どちらもブロック 1。2 試行目は着替えとポーズ確認を飛ばして挨拶から。VEQ は 1 試行目では飛ばし、2 試行目で表示）。
- **所要時間**: 挨拶 約 25〜30 秒 × 4（以前 30 秒 × 2）、SocialPresence × 4（以前 1 回）。
- **Web Console**: 参加者間の変数が `order` だけになった。条件の割り当て設定が Web Console 側にある場合は合わせること。

## 12. 触る段階を正面からの配置に戻した（2026-11-11）

- **配置**: NPC は挨拶と同じく参加者の正面に立ち、右手を正面から顔へ伸ばす。鏡は左前方の 1 枚（`Mirror`）を挨拶から触る段階の終わりまで出す。§10 の配置（NPC が右後ろ、正面の近い鏡 `MirrorTouch`）はブランチ `hao/phantom-touch-npc-behind`（コミット「Backup: NPC behind-right touch …」）に残した。
- **元に戻したもの**（2026-11-10 より前の実装と同じ）: 立ち位置の計算（`standPose`、正面のみ）、試行開始の流れ（参加者をマーカーへ戻し、1 秒後に手の届く位置へ前進）、ready の位置（肩と目標を結ぶ線の 35%、`READY_FRAC`）、手の向き（指は水平から 45° 上で真っすぐ、手のひらは顔の方。`HAND_PITCH_DEG`）、接触点（`CONTACT_LEN` / `PALM_OFF`）、目標点（参加者の左頬: `FACE_SIDE` 0.04、`FACE_UP` 0.02、`FACE_FWD` 0.09、`CHEEK_BELOW_EYES` 0.045）、retract（関節角の補間で腕を下ろす）、手を振るのは左手、Start と Trial - Touch の指示文、行データの列（`npcStandAz` / `touchSide` / `fingerCurl` を削除）。
- **残したもの**: 撫でる動作の加減速（`STROKE_RAMP_SEC`）と戻りの弧（膨らむ向きは接近方向の逆、つまり顔から NPC の方へ）、シーンのモデルから作り直したボーンマップ（指ボーンは手に追従させるだけ）、接触時の `wristErr` ログ、後ずさりの符号の修正、部屋、社会的条件の参加者内計画（§11）。
- **シーン**: `MirrorTouch` を削除（`ApplyLayout` が見つけたら消す）。Instruction の「touch」位置も削除。MirrorPanel は Trial - Greeting の開始で左前方の鏡を出し、Trial - Touch の終了で隠す。
- **確認（エディタ、without 条件）**: `[NPC] stand 0.557 m in front`、`approach: path=0.316 m, duration=15.792 s, reachable=true`、`contact: d=0.02 early=true wristErr=0.002, stroking for 15.689 s`。開始から次のステートまで約 43 秒。
- **HMD 単機での鏡**: 左前方の鏡は面までの距離が約 1.3 m なので、§10 で調べた「1 m より近いとアバターしか映らない」条件には掛からないが、参加者が鏡の方へ 0.3 m 以上寄ると掛かる。解像度（鏡全体で最大 768 × 768）は 1.2 × 1.8 m のままなので粗い。

## 13. 挨拶を具体的な指示つきに（2026-11-11）

「挨拶してください（例: 手を振る、少し横に動く）」という曖昧な指示をやめ、何をするかを 1 つずつ示す。参加者が指示どおりにした瞬間に指示文を消すので、NPC の反応（with 条件）をそのまま見られる。without 条件でも同じ指示を同じ順に出す（NPC は反応しない）。

- **指示（`GG_STEPS`、builder の `GreetingGuideJs`）と検知**:

  | # | パネルの文言 | 済んだと判定する条件 | with 条件の NPC の反応（長さ） | 済んだ後の間 |
  |---|---|---|---|---|
  | 1 | 相手に向かって／手を振ってください | 手首が頭ボーンの 10 cm 下より高く、上げたまま水平に計 12 cm 以上動いた（上げただけでは不可） | 頷き＋手振り＋笑顔（1.6 秒） | 3.0 秒 |
  | 2 | 顔を右に向けて、／相手から目をそらしてください | 頭の向き（水平）が NPC の方向から 30° 以上（2026-11-12 まで 45°）、0.3 秒（左でもよい） | なし（頭と目は参加者を追い続ける） | 1.0 秒 |
  | 3 | もう一度、／相手の顔を見てください | 頭の向きが NPC の頭の方向から 20° 以内、0.3 秒 | 頷き＋笑顔（0.8 秒） | 2.2 秒 |
  | 4 | 右へ1歩（約50cm）／動いてください | 頭が、指示が出たときの位置から左右に 20 cm 以上（2026-11-12 まで 30 cm）動いた（左でもよい） | 体ごと参加者の方へ向き直る（約 1 秒） | 2.9 秒 |
  | 5 | もう一度、／相手の顔を見てください | 3 と同じ（50 cm 動いた後は NPC が約 27° 横にいるので、頭を向け直す必要がある） | 手振り＋笑顔（1.6 秒） | 3.0 秒 |
  | 6 | 中央（青いマーク）に戻って、／正面を見てください（2026-11-12 に追加、§16） | 頭がマーカーから左右 15 cm 以内で、頭の向きが NPC の頭の方向（マーカーの正面）から 20° 以内、0.3 秒 | 体ごと参加者の方へ向き直る（約 1 秒） | 2.9 秒の後、Trial - Touch へ |

- **流れ**（2026-11-11 の 2 回目の変更で、NPC から先に挨拶し、間を NPC の反応の長さから決めるようにした）: ステート開始の 1.0 秒後に NPC へ合図 `hello` を送る（with 条件では NPC が頷き＋手振り＋笑顔、1.6 秒）。その 3.0 秒後（ステート開始の 4.0 秒後）に 1 つ目の指示を出す。指示が済んだらすぐ消し、NPC に合図（`npc_greet_cue`）を送り、上の「間」だけ何も出さずに待ってから次を出す。間は「with 条件での NPC の反応の長さ（`GG_HELLO` / `GG_STEPS` の `react`）+ 1.4 秒（`GG_REACT_MARGIN`。メッセージの遅れやフレーム落ちの分）」、NPC が反応しない指示の後は 1.0 秒（`GG_NO_REACT_PAUSE`）。5 つ目の後も同じで、NPC の最後の手振りが終わってから Trial - Touch へ移る。without 条件では NPC は何もしないが、ガイドの時間の流れは with 条件とまったく同じ（ガイドは社会的条件を見ない）。指示を出す時点ですでに条件を満たしていたら、パネルは出さずに済んだ扱いにする（例: 4 で 30 cm しか動かず、すでに NPC の方を向いている場合の 5）。**Trial - Greeting の Exit Time は外した**（`SetStateExitTime(…, null)`、ステートオブジェクトの ItemTimer は `state_enter(disabled)`）。`react` の値は `NpcController.js` の `NPC_CFG`（`WAVE_SEC` 1.6、`NOD_SEC` 0.8、体の向き直りは `BODY_TURN_RATE` 2.5/s で 60° から 4° まで約 1.1 秒）より短くしてはいけない。`greeting-guide.test.mjs` がこれを確かめる。
- **安全装置**: 1 つの指示が 10 秒（`GG_TIMEOUT_SEC`。2026-11-12 まで 30 秒）済まなければ飛ばして次へ（NPC には知らせない。0.5 秒後に次の指示）。全体で 180 秒（`GG_MAX_SEC`）を超えたら終了して次のステートへ。所要時間は、すぐ従えば約 23〜25 秒（開始から 1 つ目まで 4 秒 + 間の合計 12.1 秒 + 動作）。
- **パネル**: 新しいステート連動アイテム `GreetingGuide`（立ち位置に置く。子 `Text` と、その子の赤い背景 `Bg`、マテリアル `BgGreetingGuide`）。指示を出すとき、頭ボーンから頭の水平の向きへ 0.7 m、頭ボーンの 5 cm 下（目の高さから約 10° 下なので、NPC の目は隠れない）に置き、目の方へ向ける。その後、頭の向きから 30° 以上外れるか、距離が 0.25 m 以上ずれるか、頭の位置が置いたときから水平に 10 cm 以上動いたら（`GG_REPLACE_MOVE`。2026-11-12 に追加: 横への移動の判定を 20 cm にした後、20〜30 cm 横に動いても前の 2 つの条件に届かず、頭を少し回すまでパネルが付いてこなかった）置き直す（常に頭に固定はしない）。なので 2 で顔を横に向けた後の 3 の指示は、向いている先に出る。背景は文字数に合わせて拡大縮小（指示板と同じ方法）。ParticipantManager の新規参加者確認パネル（§8）と同じ「目の前の赤いパネル」。
- **NPC 側**: `NpcController.js` は合図にだけ反応する（`greetCue` → `GREET_REACTIONS`）。自分で視線・挙手を見て反応する処理と、5 秒無反応時の頷き（`IDLE_REACT_SEC`、`REACT_COOLDOWN_SEC`、`JOY_PROB`）は削除した。反応が全参加者で同じになる（最初の挨拶を含めて頷き 3 回・手振り 3 回・笑顔 4 回・向き直り 1 回）。反応の終わりはログに出る（`[NPC] reaction wave ended after 1.6 s`、向き直りは `reaction move (turn) ended`）。ガイドのログには挨拶開始からの経過時間が付く（`[GreetingGuide] t=4.0 s: show wave`）。触る段階の prep の挨拶（`PREP_REACTION`）と、触られたときの驚き顔はそのまま。
- **NPC の位置の扱い**: ステート連動アイテムからは NPC の位置を読めない（`ItemHandle` に `getPosition` が無い）ので、「NPC の方向」はマーカーの正面 1.0 m（`GuideNpcDist`。NPC の会話距離の実測 1.007 m）を参加者の頭の高さで見た方向としている。NPC の腕の長さが変わっても誤差は数度。
- **行データ**: `greetStepSec`（各指示が出てから済むまでの秒数を `,` でつないだもの。0 = 出す前から満たしていた、-1 = 時間切れ（10 秒。2026-11-12 まで 30 秒）で飛ばした。例 `1.7,1.6,1.6,1.3,2.2`）、`greetTimeouts`（飛ばした数）、`greetCues`（NPC が受け取った合図の数。最初の `hello` を含めて通常 6。without でも数える）。5 つ目が済んだ時点で書く（NPC がステート終了時に自分のカウンタを書くのと重ならないように）。
- **既存シーンへの反映**: メニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)` が、`GreetingGuide` が無ければ LUIDA の通常の手順（`CreateStateListeningItem`）で作り、配置・背景・NPC への参照を付け、Exit Time を外す。
- **確認**: エディタで 2 試行（without → with）を通した。参加者の動きは、エミュレータのアバターの腕・向き・位置をエディタ側から動かして再現。両条件で 5 つとも検知され、最後の指示の 3 秒後に Trial - Touch へ。with では `[NPC] greet cue wave -> {"nod":true,"wave":true,"joy":true}` など 4 つの反応、`greeting end: … cues=5 reactions=3`。without では `(no reaction)` × 5、`reactions=0`。タイムアウトで飛ばす経路も確認。モックテスト `greeting-guide.test.mjs`（順番、パネルの位置と追従、手を上げただけでは不可、タイムアウト、満たしている指示の省略、ステート終了で停止）。
- **確認（2 回目の変更の後）**: エディタで with と without を 1 試行ずつ（ブロック 1 の 2 試行。今回は 1 試行目が with）、参加者が指示に従って動く様子を再現して通した。参加者の動き: 右手を上げて前腕を左右に振る（2 往復で検知）、頭を右へ 60°、正面へ戻す、右へ 0.5 m、NPC の方へ向き直る。エミュレータの参加者アバターは透明なので、スクリーンショットでは同じ姿勢をコピーした別の VRM を重ねて写した。with: `hello` 1.0 s → NPC の挨拶が終わる（1.6 s）→ 1 つ目の指示 4.4 s → … → 最後の合図の 3.0 s 後に Trial - Touch。各反応の終了ログはどれも次の指示より前（例 `reaction lookAgain ended after 2.2 s` → `finished (3.0 s after the last cue)`）。エディタではスクリーンショットのたびに 0.5〜0.7 秒止まり、そのフレームの経過時間がまとめて加わるので、反応の長さが 2.2 秒のように長めに出るが、それでも間に収まった。without: NPC は反応せず、指示の出る時刻の間隔は with と同じ。モックテスト 30 件。
- **実機で未確認**: VR での手首の高さの閾値（コントローラを顔の横まで上げれば足りる想定）、パネルを置き直したときの見え方（Cluster ではサブノードの移動が補間されるので、他の位置から滑ってくるように見える可能性がある）、0.7 m の距離での読みやすさ。

## 14. 触る段階でスティックで後ろへ下がれるように（2026-11-12）

手が近づく間に不快になった参加者が、手から離れられるようにした。手の経路は今までどおり接近開始の時点で固定（参加者を追わない）なので、下がった分だけ手は届かず、撫でる動作はその場（空中）で最後まで行う。刺激の流れと記録は、下がった試行も含めて全試行で最後まで同じ。

- **速さ**: `Trial - Touch` の間だけ、スティックの移動速度を通常の 0.1 倍にする（NpcDirector の `ND_TOUCH_MOVE_RATE`。エディタのプレビューの基準 2.5 m/s で約 0.25 m/s）。手の 2 cm/s よりずっと速く、歩き回るほどではない速さ。指示板の文言と合わせるため、ステート開始から有効。手が動き出す前に下がった場合は、接近開始時の頭の位置を狙うので、手が届かないことがある（`reachable`、`rootShiftPre`）。ステート終了で 0 に戻す。実機の Cluster の基準速度は未確認。
- **伝え方**: Start の説明文に「スティックでの移動は、必要な場面以外では止めてあります。（その場で頭や体を動かすのは自由です）」、Touch の指示板に「（不快に感じたら、スティックで後ろに下がれます）」。毎試行・両条件で同じ文言なので、社会的条件の比較には偏らない（下がる人の割合そのものは増えうる）。
- **マーカーへ戻す**: Report ではスティックが止まるので、NPC が会話距離へ下がって消えた時点で、参加者をマーカー（台があればその上）へ戻す（向きはそのまま）。離れた距離によらず毎回戻す（当初は 15 cm 以上離れたときだけだったが、同日に毎回へ変更）。ログ `[NPC] participant put back on the marker (was 0.6 m away)`。120 秒のタイムアウトで打ち切った場合も同じ。台は 1.6 m 四方なので、0.8 m 以上下がると台から降りる。
- **行データ**（追加）: `touchMoveRate`（0.1）、`rootStart`（接近開始時のアバター位置 x,y,z）、`rootShiftPre`（そのときのマーカーからの水平距離。手が動き出す前に下がった量）、`rootRetreat`（`retreatDist` と同じ方法でアバター位置について求めた、手から離れる向きの最大移動量。基準は接近の最初の 1 秒の平均）、`rootShiftEnd`（腕を下ろし終えたときのマーカーからの水平距離）、`returnedToMarker`（NPC が消えた後マーカーへ戻したか）。`trace` は各サンプルの末尾にアバター位置 `rx,ry,rz` を足した（`traceFormat` = `t,hx,hy,hz,hqx,hqy,hqz,hqw,d,rx,ry,rz`。読めないときは空）。頭の動きからアバター位置の動きを引けば、体を傾けた分とスティックで下がった分を分けられる。ただし実機の VR で、部屋の中を実際に歩いたり体を傾けたりしたときにアバター位置（`PlayerHandle.getPosition`）がどこまで動くかは未確認。
- **確認**: エディタで 1 試行（without）。Start で移動速度 0、Touch で 0.1。手が動き出した後に参加者を 0.6 m 後ろへ動かした（エディタからの操作が遅く、約 10 秒かかった）。結果は `contact: d=0.52`（手は元の経路の終点で止まる）、`trial done: … retreat=0.6 rootRetreat=0.595 rootShiftPre=0 rootShiftEnd=0.6`、NPC が消えた後 `participant put back on the marker from 0.6 m away`、Report で移動速度 0・位置はマーカー。Start と Touch の指示板の文字は枠内に収まり、Start の「OK」ボタンとも重ならない。モックテスト `touch-stick-retreat.test.mjs`（速度の切り替え、trace の列と `rootRetreat`、マーカーへ戻す条件）。

## 15. 手を伸ばす先を目の少し上に（2026-11-12）

目標点の高さを、頬（目ボーンの中点の 4.5 cm 下）から、目の少し上（目ボーンの中点の 2 cm 上、`ABOVE_EYES`）へ 6.5 cm 上げた。目ボーンを読まないとき（テストモード、目ボーンの無いアバター）は Head ボーンの 8.3 cm 上（`FACE_UP`。このプロジェクトの VRoid のアバター 4 体では目ボーンが Head ボーンの 6.2〜6.4 cm 上にあるので、同じ高さ）。左右（`FACE_SIDE` 4 cm）と前後（`FACE_FWD` 9 cm）は変えていない。立ち位置は自動で再計算される（エディタで 0.557 → 0.543 m）。

- **カメラの高さを使わない理由**: Cluster Script では PlayerScript の `cameraHandle.getPosition()` で一人称のカメラ位置（VR では HMD）を読めるが、PlayerScript は参加者 1 人に 1 つで、LUIDA の `LuidaBasicPlayerScript.js` が使っている。使うには LUIDA のテンプレートに問い合わせと返信のメッセージを足す必要がある。一方、UniVRM の一人称の既定のオフセットは Head ボーンの 6 cm 上で、目ボーン（6.2〜6.4 cm）との差は約 1 cm なので、目ボーンで代用した（Cluster が実際にこのオフセットを使うかは未確認）。
- **撫でる動作**: 接触点から真下へ 6 cm（`STROKE_AMP`）なので、指は左目の上（正中から 4 cm）から目の前を通って頬の上端まで下りる。参考画像（右目〜頬に触れる）に近い。
- **確認**: エディタで 1 試行。`approach: path=0.319 m … reachable=true`、`contact: d=0.02 early=true wristErr=0.006`。横から見て、指先が眉の高さ（左目の上）で止まる。

## 16. 挨拶の最後に「中央に戻って正面を見る」を追加、閾値を下げた（2026-11-12）

- **6 つ目の指示**: 「中央（青いマーク）に戻って、／正面を見てください」（合図 `center`）。足元に台（`HeightPlatform`）がある参加者には床の青いマットが見えないので、台が上がっている間は台の上面にも同じ青いマット（`HeightPlatform` のサブノード `TopMarker`、`Study4Platform.js` が台と一緒に動かす）を出す（当初の文言は「中央（床の青いマーク）」）。頭がマーカーから左右 15 cm 以内（`GG_CENTER_DIST`）で、かつ NPC の頭の方向（マーカーの正面）から 20° 以内を 0.3 秒保てば済み。with 条件では NPC が体ごと参加者の方へ向き直る（`GREET_REACTIONS.center = { turn: true }`。横へ動いたときと同じ反応）。その 2.9 秒後に Trial - Touch へ。横へ動かなかった参加者（4 を飛ばした場合）は最初から満たしているので、表示せずに済みにする。
- **閾値**: 目をそらす角度 `GG_LOOK_AWAY_DEG` 45° → 30°、横への移動 `GG_MOVE_DIST` 30 cm → 20 cm。指示の文言（右へ 1 歩、約 50 cm）は変えていない。
- **行データ**: `greetStepSec` は 6 個、`greetCues` は通常 7（`hello` を含む）。所要時間は、すぐ従えば約 30〜35 秒。
- **確認**: モックテスト（6 つの順番、中央に戻っただけで横を向いたままでは済みにならない、など）。エディタで with 条件を 1 試行: 6 つとも検出、`greet cue center -> {"turn":true}`、`greeting end: … cues=7 reactions=4`、最後の合図の 2.9 秒後に Trial - Touch へ。

## 17. 手を伸ばす先の高さと撫でる長さを、姿勢確認で測った肩と腕から決める（2026-11-12）

NPC が手を伸ばす先の高さは「肩の高さ + 腕の長さの半分」、撫でる動作はそこから下へ、肩の 4 cm 上まで。肩の高さと腕の長さは、姿勢確認（`Trial - PoseCheck`、アバター条件ごとに 1 回）で鏡を見ながら腕を伸ばしてもらって測る。（同日の途中の版: 目の高さ・額の高さをボタンで測る → 両手を額の高さで 3 秒 → 両手を頭のてっぺんで 3 秒にして目との中間、を経てこの形にした。）

- **指示**: 正面の指示板は「鏡を見ながら、次の動きをしてください。／1) 頭をゆっくり左右に向ける／2) 両腕を横にまっすぐ伸ばして、3秒そのまま／3) 両腕を前にまっすぐ伸ばして、3秒そのまま」。右のパネルのチェックは「[　] 頭を左右に向ける／[　] 両腕を横に（3秒）／[　] 両腕を前に（3秒）」。
- **判定**（DeviceCheck アイテム、builder の `DeviceCheckLegacy`）: 長さの基準はすべてアバターの身長（頭ボーン − 足元、H）に対する比なので、とても小さい／大きいアバターでも同じように判定できる。向きは体の向き（`PlayerHandle.getRotation`。頭は 1 で動くので使わない）。頭を左右に向けるのはいつでもよく、2 → 3 は順番。
  - 両腕を横: それぞれの手が体の横へ 0.25 H 以上、前後は 0.2 H 以内、頭ボーンの 0.35 H 下〜0.05 H 上、左右の手の高さの差 0.1 H 以内。3 秒保つと、両手の高さの平均を肩の高さとする。
  - 両腕を前: それぞれの手が頭ボーンより 0.2 H 以上前、横へは 0.2 H 以内、肩の高さ（2 で測ったもの）から 0.12 H 以内。3 秒保つと、それぞれの手の肩からの距離（前への距離と、肩との高さの差から。肩の関節は頭ボーンと同じ前後位置とみなす）の平均を腕の長さとする。
  - どちらも、手が姿勢から外れるか、保持を始めた位置から 0.035 H（約 5 cm）以上動くと、その時点から数え直す。60 秒後の救済ボタンは従来どおり。
- **使い方**: 両方測れたら NPC へ送る（`npc_body_cal { shoulderUp, arm }`）。NPC は次の `npc_setup`（次のブロック）まで保持する。手を伸ばす先の高さは、次の 2 つのうち高い方（2026-11-12 から。アバターごと・触るたびに両方を計算して比べる。どちらかに決め打ちはしない）: (a) 肩の高さ + 腕の長さ ÷ 2、(b) 目ボーンの高さ + 4.5 cm（`FOREHEAD_ABOVE_EYES`。目ボーンは本番だけ読む）。撫でる長さは、選んだ高さから肩の 4 cm 上まで（`STROKE_STOP_ABOVE_SHOULDER`。最低 3 cm）。測れなかったとき（救済ボタン）は、アバターの上腕・前腕・手のボーンから肩の高さと腕の長さを読む（必須ボーンなので、目ボーンと違ってエディタのエミュレータでも読める）。それも無ければ目ボーン + 4.5 cm、頭ボーン + 10.8 cm（撫でる長さは `STROKE_AMP` 9 cm）。
- **行データ**: 姿勢確認の行に `poseShoulderUp`（頭ボーンからの肩の高さ。下が負）、`poseArmLen`, `poseArmLeft`, `poseArmRight`（測れなければ空）。試行の行に `faceUp`（目標点の高さ、頭ボーンから）、`faceUpSrc`（選ばれた方: `pose` / `bones` / `eyeBones` / `headBone`）、`faceUpBody`, `faceUpEyes`（2 つの候補。分からなければ空）、`strokeAmp`（実際の撫でる長さ）。ログ `[NPC] approach: … target 0.106 m above the head bone (pose; body 0.106, eyes -), stroke 0.2 m`（エディタは目ボーンを読まないので eyes -）。ログ `[DeviceCheck] arms out: shoulder -0.134 m …`、`arms forward: arm 0.479 m …`、`[NPC] approach: … target 0.105 m above the head bone (pose), stroke 0.2 m`。
- **確認**: モックテスト `pose-body.test.mjs`（3 段階で肩と腕を送る、前が先・左右の高さ違い・肘の曲がり・肩より高い前・動いた手は数えない、0.3 倍のアバターでも通る、救済ボタンでは送らない、2 試行目は飛ばす、NPC の高さと撫でる長さ、ボーンからの代わりの値）。エディタで、参加者のアバターの腕を横・前へまっすぐにすると、肩 −0.134 m（ボーンでは −0.136 m）、腕 0.479 m（ボーンでは 0.485 m）、目標点は頭ボーンの 0.105 m 上、撫でる長さ 0.20 m、撫でる時間 43 秒（3 往復）。正面の指示板の 4 行は鏡に重ならない。
- **実機で未確認**: VR で腕を伸ばしきらない（肘が少し曲がる）と腕の長さが短く出て、手を伸ばす先が低く、撫でる長さが短くなる。アバターのボーンから直接読む方法なら姿勢に左右されない（今は救済ボタンのときの代わりの値としてだけ使っている）。

## 18. 手を伸ばす先を額に、めり込みの修正（2026-11-12）

目標点を目の 2 cm 上（§15）にした後、NPC の手が参加者の顔にめり込んだ。目標点の前後位置が頬のときの 9 cm（頭ボーンから前）のままで、額の高さでは前髪の表面（VRoid のアバターで 10〜10.5 cm 前）より内側だったため。エディタで、参加者に重ねた VRoid（`luida_default_avatar_02` と `YoungAvatar`）の顔・髪のメッシュと NPC の右手・指の頂点の前後方向の隙間を、接触から撫で終わりまで測って調整した（隙間は水平方向に測るので、額のように後ろへ傾いた面では実際より大きく出る。めり込み（表面より奥）の判定は正しい）。

- **高さ**: 肩の高さ + 腕の長さ ÷ 2（§17。それ以前は頭のてっぺんにかざした両手と目の中間）。
- **前後**: `FACE_FWD` 0.09 → 0.095。
- **撫でる長さと向き**: 6 cm → 9 cm（`STROKE_AMP`。§17 の後は、目標点から肩の 4 cm 上まで: 腕の長さ ÷ 2 − 4 cm。エディタのアバターで 20 cm、撫でる時間 43 秒。下の方では顎・首の前を通るので顔から離れる）。真下ではなく、9 cm 下がる間に顔から 0.9 cm 離れる（`STROKE_INWARD` −0.1）。額から下ろすと、接触点より上にある指先が、目の前に垂れた前髪に撫で終わりで当たるため。顔の傾きに沿って内側へ寄せる（+0.4）と、指先が前髪に 1.7 cm めり込んだ。撫でる時間は 15.7 秒 → 21.4 秒。
- **結果**（`luida_default_avatar_02`、両手 0.219 m → 目標点 0.141 m）: 撫でている間ずっとめり込みなし、最小の隙間 1.4 cm（人差し指の先と前髪、水平方向）。横から見て、撫で始めは指先が額の前髪に触れ、撫で終わりは目の前の前髪のすぐ手前。調整の途中の値（目標点 0.109 m、撫で 6 cm）: 0.105・真下で最小 1.2 cm（`YoungAvatar`）、0.098・真下で −0.1 cm、0.100・真下で −0.6 cm、0.100・−0.2 で 0.8 cm。目標点 0.141 m・撫で 9 cm: 0.100・−0.2 で 2.2 cm、0.095・−0.1 で 1.4 cm（採用）。エディタの参加者アバターの待機モーションで頭が揺れるため、測るごとに 0.5 cm ほどばらつく。
- **限界**: 前後位置と撫でる向きは VRoid の顔と前髪に合わせた定数。前髪の長いアバターや顔の大きく違うアバター（普段使いのアバター）では、めり込むことも離れすぎることもありうる。

## 19. とても小さい／大きいアバター: 台が出ない不具合、天井（2026-11-12）

- **小さいアバターで台が出なかった**: NPC が参加者の身長（頭ボーン − 足元）を読む `participantHeight` が、0.5 m 以下を「ボーンが読めない」とみなしていた。頭ボーンが 0.5 m 以下のとても小さいアバターでは身長合わせが 3 秒後に打ち切られ（ログ `height match skipped: participant bones not readable`）、台が出なかった。0.05 m 以下だけを読めないとみなすようにした。
- **台と NPC の踏み台を 5 m の立方体に**: どちらも 1 m の立方体（上面が足元、上がっていないときは床下）だったので、差が 1 m を超えると下が浮いていた（とても小さい参加者の台、とても大きい参加者に合わせる NPC の踏み台）。5 m にした（`PlatformSize` / `RiserSize`、`Study4Platform.js` の `CUBE_HEIGHT`）。上がっていない部分は今までどおり床下。
- **天井**: とても大きいアバターのために、部屋の高さを 2.9 m → 5 m（`RoomHeight`、メニュー `LUIDA > Study4 > Build room (keep scene)` で作り直す）。壁と天井の部品（Apartment Kit、元は 4 m）を縦に伸ばしているだけ。Cluster のアバターの身長に公式の上限は見当たらず（16.7 m の巨大ロボットのアバターも売られている。制限はワールドごと）、5 m は目安。
- **確認**: エディタで参加者のアバターを 0.3 倍（頭ボーン 0.448 m）にすると、`height match: participant head 0.448 m, NPC head 1.431 m -> platform 0.983`、台は床まで届き、上面に青いマットが出る。部屋の高さは 5 m。モックテスト（小さいアバターの身長を読む、5 m の立方体の位置）。
- **未対応**: NPC が手を伸ばす先の前後位置（`FACE_FWD`）、撫でる長さ、目の高さの代わりの値（`EYE_UP`）、姿勢確認の手の判定の範囲（`DC_EYE_UP` / `DC_HANDS_MAX_UP`）は、普通の大きさの VRoid のアバターに合わせた長さ（m）のまま。とても大きいアバターでは指が顔に深くめり込み、とても小さいアバターでは顔に届かない。姿勢確認も、とても大きいアバターでは手が判定の上限（頭ボーン + 40 cm）を超えて通れない（60 秒後の救済ボタンで進む）。参加者の大きさ（身長合わせで読んだ頭ボーンの高さ）に比例させれば直せる。

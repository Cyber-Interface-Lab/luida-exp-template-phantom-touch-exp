// Study 4 (phantom touch illusion) scene builder.
//
// Generates the complete "PhantomTouch" experiment scene on top of LUIDA's own editor
// utilities (scene template, state machine, state-listening items, questionnaires,
// data collector, avatar wrapper builder). Everything the LUIDA GUI would have
// produced is produced here programmatically, so the result can be inspected and
// further edited with the normal LUIDA windows.
//
//   Menu:  LUIDA > Study4 > Build PhantomTouch scene
//   Batch: Unity.exe -batchmode -quit -projectPath <proj> -executeMethod Study4SceneBuilder.BuildFromBatch
//
// Design document: research/study4-phantom-touch/implementation-plan.md
#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using ClusterMetaverseLab.Luida.Scripting;
using ClusterVR.CreatorKit.Gimmick;
using ClusterVR.CreatorKit.Gimmick.Implements;
using ClusterVR.CreatorKit.Item.Implements;
using ClusterVR.CreatorKit.Operation.Implements;
using ClusterVR.CreatorKit.Trigger.Implements;
using ClusterVR.CreatorKit.World.Implements.TextView;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

public static class Study4SceneBuilder
{
    // ------------------------------------------------------------------ paths
    public const string SceneName = "PhantomTouch";
    const string ScenePath = "Assets/_Experiment_/Scenes/" + SceneName + ".unity";
    const string StateListPath = "Assets/_Experiment_/Settings/StateList/" + SceneName + ".asset";
    const string VariablesPath = "Assets/_Experiment_/Settings/ExperimentVariables/" + SceneName + ".js";
    const string DataCollectorConfigPath = "Assets/_Experiment_/Settings/DataCollectorConfig/" + SceneName + ".asset";
    const string DataCollectorJsPath = "Assets/_Experiment_/Scripts/DataCollectors/" + SceneName + ".js";
    const string ItemScriptsFolder = "Assets/_Experiment_/Scripts/StateManagement/" + SceneName;
    const string AvatarsFolder = "Assets/_Experiment_/Avatars/" + SceneName;
    const string PrefabsFolder = "Assets/_Experiment_/Prefabs/" + SceneName;
    const string MaterialsFolder = "Assets/_Experiment_/Materials/" + SceneName;
    const string NpcPrefabPath = PrefabsFolder + "/NPC.prefab";
    const string NpcFaceControllerPath = PrefabsFolder + "/NpcFace.controller";
    const string NpcFaceNeutralClipPath = PrefabsFolder + "/NpcFaceNeutral.anim";
    const string NpcFaceJoyClipPath = PrefabsFolder + "/NpcFaceJoy.anim";
    const string NpcFaceSurprisedClipPath = PrefabsFolder + "/NpcFaceSurprised.anim";
    const string NpcSmileClipPathLegacy = PrefabsFolder + "/NpcSmile.anim";

    // Face expressions (blend-shape weights 0-100) driven by NpcController.js through the Animator.
    static readonly (string shape, float weight)[] JoyShapes = { ("Fcl_EYE_Joy", 100f), ("Fcl_MTH_Joy", 50f) };
    static readonly (string shape, float weight)[] SurprisedShapes = { ("Fcl_EYE_Surprised", 50f), ("Fcl_MTH_Surprised", 50f) };
    const float SurprisedSeconds = 1.0f;
    const string MirrorPrefabPath = "Packages/mu.cluster.cluster-creator-kit/PackageResources/Prefabs/Mirror.prefab";

    const string StateListTemplatePath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/ExpSettings/StateList/Template.asset";
    const string VariablesTemplatePath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/ExpSettings/VariablesTemplate.js";
    const string ConditionManagerJsPath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Scripts/ConditionManagement/ConditionManager.js";
    const string GatePrefabPath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/WorldGateToLuidaBar.prefab";
    const string DataCollectorPrefabPath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/CustomDataCollection/LUIDA-DataCollector.prefab";
    const string ExpManagersPrefabPath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/LUIDA-ExpManagers.prefab";
    const string ConditionManagerPrefabPath = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/ConditionManagement/ConditionManager.prefab";
    const string ResetLogicResourcePath = "ClusterMetaverseLab/LuidaExpTemplate/FakeGimmickSources/ResetGlobalBool";

    const string NpcVrmPath = "Assets/_Experiment_/Avatars/ProteusSample/Source/YoungAvatar.vrm";
    const string NpcControllerJsPath = "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js";
    const string ButtonJsPath = "Assets/_Experiment_/Scripts/PhantomTouch/Study4Button.js";
    const string PlatformJsPath = "Assets/_Experiment_/Scripts/PhantomTouch/Study4Platform.js";
    const string HeightPlatformName = "HeightPlatform";   // item under the standing spot (NpcController raises its Cube)

    // ------------------------------------------------------------------ state ids
    const int S_START = 0, S_TSTART = 1, S_POSE = 2, S_GREET = 3, S_TOUCH = 4, S_REPORT = 5,
              S_VEQ = 6, S_TREST = 7, S_SOCIAL = 8, S_PERSONAL = 9, S_DEBRIEF = 10, S_END = 11;
    const string PoseStateName = "Trial - PoseCheck";
    const float GreetingSeconds = 30f;
    const float RestSeconds = 10f;      // pause between trials ("Trial - Rest")

    // ------------------------------------------------------------------ entry points
    [MenuItem("LUIDA/Study4/Build PhantomTouch scene")]
    public static void BuildFromMenu()
    {
        if (!EditorUtility.DisplayDialog("Build PhantomTouch scene",
            "This (re)generates the PhantomTouch scene and all of its per-scene LUIDA assets.\n" +
            "Existing PhantomTouch assets will be deleted first. Continue?", "Build", "Cancel"))
            return;
        Build();
        EditorUtility.DisplayDialog("Study 4", "PhantomTouch scene generated.\nSee research/study4-phantom-touch/ for the design document.", "OK");
    }

    /// <summary>Same as the menu above but without the confirmation dialog (for remote/automated execution).</summary>
    /// <summary>Rebuilds only the NPC face expression Animator on the existing NPC prefab (no scene rebuild).</summary>
    [MenuItem("LUIDA/Study4/Rebuild NPC face animator")]
    public static void RebuildNpcFaceAnimator()
    {
        var contents = PrefabUtility.LoadPrefabContents(NpcPrefabPath);
        try
        {
            AddFaceExpressionAnimator(contents);
            PrefabUtility.SaveAsPrefabAsset(contents, NpcPrefabPath);
        }
        finally
        {
            PrefabUtility.UnloadPrefabContents(contents);
        }
        AssetDatabase.SaveAssets();
        var sceneNpc = EditorSceneManager.GetActiveScene().name == SceneName ? FindRoot("NPC", false) : null;
        if (sceneNpc != null)
        {
            AttachFaceExpression(sceneNpc.gameObject, EnsureFaceAssets(false));
            EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        }
        Debug.Log("[Study4] NPC face animator rebuilt on " + NpcPrefabPath + (sceneNpc != null ? " and on the scene NPC" : ""));
    }

    /// <summary>
    /// Rewrites the actions of the Study 4 state-listening items (listeners, event handlers, legacy code)
    /// from this builder's definitions, regenerates their JS and combines scripts. Scene objects are not
    /// touched, so hand edits to the scene survive. Hand edits to the items' actions are overwritten.
    /// </summary>
    [MenuItem("LUIDA/Study4/Update item behaviours (keep scene)")]
    public static void UpdateItemBehaviours()
    {
        RewriteItemBehaviours(null, true);
    }

    // only: names of the items to rewrite (null = all). Both the item data and the generated JS are limited to them,
    // because ApplyAssetsToScripts regenerates the JS of every item in the tab it is given.
    static void RewriteItemBehaviours(string[] only, bool rewriteCollector)
    {
        if (EditorSceneManager.GetActiveScene().name != SceneName)
            throw new Exception("Open the " + SceneName + " scene first.");
        var l = ComputeLayout();
        var tab = ScriptableObject.CreateInstance<ItemsManagerConfigTab>();
        try
        {
            tab.OnEnable();
            ItemsManagerAssetUtil.RefreshStateListeningItems(tab);
            var defs = new (string name, Func<List<StateListener>> listeners, Func<List<EventHandlerData>> handlers, string legacy)[]
            {
                ("Instruction", InstructionListeners, null, InstructionLegacy(l)),
                ("NpcDirector", () => NpcDirectorListeners(l), NpcDirectorHandlers, NpcDirectorLegacy),
                ("AvatarGate", AvatarGateListeners, null, AvatarGateLegacy),
                ("DeviceCheck", DeviceCheckListeners, null, DeviceCheckLegacy),
                ("ReportPanel", ReportPanelListeners, ReportPanelHandlers, ReportPanelLegacy),
                ("MirrorPanel", MirrorPanelListeners, null, ""),
                ("ExitPortal", ExitPortalListeners, null, ExitPortalLegacy()),
            };
            foreach (var d in defs)
            {
                if (only != null && !only.Contains(d.name)) continue;
                var go = tab.stateListeningItems.FirstOrDefault(g => g != null && g.name == d.name);
                if (go == null) { Debug.LogWarning("[Study4] state-listening item not found: " + d.name); continue; }
                WriteItemData(go, d.listeners(), d.handlers != null ? d.handlers() : null, d.legacy);
            }
            ItemsManagerAssetUtil.RefreshStateListeningItems(tab);
            // The tab is a throwaway instance, so narrowing its item list does not affect the LUIDA window.
            if (only != null)
                tab.stateListeningItems = tab.stateListeningItems.Where(g => g != null && only.Contains(g.name)).ToList();
            ItemsManagerAssetUtil.ApplyAssetsToScripts(tab);
        }
        finally
        {
            tab.OnDisable();
            Object.DestroyImmediate(tab);
        }
        if (rewriteCollector)
        {
            var config = DataCollectorCreateMenu.FindOrCreateBuilderConfig();
            if (config != null)
            {
                config.useCustomCodeMode = true;
                config.rawJs = DataCollectorJs;
                EditorUtility.SetDirty(config);
                AssetDatabase.SaveAssets();
                DataCollectorJsSaver.WriteAndCombine(config);
            }
        }
        LuidaScriptCombiner.CombineAll();
        EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        Debug.Log("[Study4] item behaviours updated" + (only != null ? " (" + string.Join(", ", only) + ")" : "") +
                  " (scene objects untouched; save the scene to keep the combined scripts)");
    }


    /// <summary>
    /// Re-applies the UI layout (instruction board, side panels, buttons, coloured backings, mirror) to the
    /// existing scene objects, then rewrites the item behaviours (the instruction placements and the panel
    /// texts depend on the layout). Nothing else in the scene or the settings (e.g. the state list) changes.
    /// </summary>
    [MenuItem("LUIDA/Study4/Update layout and behaviours (keep scene)")]
    public static void UpdateLayoutAndBehaviours()
    {
        if (EditorSceneManager.GetActiveScene().name != SceneName)
            throw new Exception("Open the " + SceneName + " scene first.");
        ApplyLayout(ComputeLayout(), CreateMaterials());
        SetStateExitTime("Trial - Greeting", GreetingSeconds);
        SetStateExitTime("Trial - Rest", RestSeconds);
        UpdateItemBehaviours();
    }

    /// <summary>
    /// Moves the old "DeviceCheck" state (before the trials) into the trials as PoseStateName, right after
    /// "Trial - Start", in the state list, the variables JS and the existing state objects. The state objects are
    /// re-ordered and re-numbered in place (LUIDA's own regeneration would also recreate the questionnaire forms).
    /// The state's other settings (exit time) are kept. Then the layout and the item behaviours are updated.
    /// </summary>
    [MenuItem("LUIDA/Study4/Move the pose check into the trials (keep scene)")]
    public static void MovePoseCheckIntoTrials()
    {
        if (EditorSceneManager.GetActiveScene().name != SceneName)
            throw new Exception("Open the " + SceneName + " scene first.");
        var sl = AssetDatabase.LoadAssetAtPath<StateList>(StateListPath);
        if (sl == null) throw new Exception("StateList asset missing: " + StateListPath);
        var list = sl.States.ToList();
        int dev = list.FindIndex(s => s.StateName == "DeviceCheck");
        if (dev >= 0)
        {
            var st = list[dev];
            list.RemoveAt(dev);
            st.StateName = PoseStateName;
            int ts = list.FindIndex(s => s.StateName == "Trial - Start");
            if (ts < 0) throw new Exception("Trial - Start not in the state list");
            list.Insert(ts + 1, st);
        }
        else if (list.FindIndex(s => s.StateName == PoseStateName) < 0)
            throw new Exception("neither DeviceCheck nor " + PoseStateName + " is in the state list");
        for (int i = 0; i < list.Count; i++)
        {
            var s = list[i];
            s.DestStateName = i < list.Count - 1 ? list[i + 1].StateName : "";
            list[i] = s;
        }
        if (list.Count != 12 || list[S_POSE].StateName != PoseStateName || list[S_TSTART].StateName != "Trial - Start")
            throw new Exception("unexpected state order: " + string.Join(", ", list.Select(s => s.StateName)));
        sl.States = list.ToArray();
        EditorUtility.SetDirty(sl);
        AssetDatabase.SaveAssets();
        WriteVariablesJs(sl);

        var managers = FindRoot("LUIDA-ExpManagers", false);
        var statesRoot = managers != null ? managers.Find("States") : FindRoot("States", false);
        if (statesRoot == null) throw new Exception("States container not found");
        var old = statesRoot.Find("DeviceCheck");
        if (old != null) old.name = PoseStateName;
        var tab = ScriptableObject.CreateInstance<StateMachineConfigTab>();
        try
        {
            tab.OnEnable();
            const BindingFlags bf = BindingFlags.NonPublic | BindingFlags.Instance;
            var setCur = typeof(StateMachineConfigTab).GetMethod("UpdateTransitionCurrentStateId", bf);
            var setDest = typeof(StateMachineConfigTab).GetMethod("UpdateTransitionDestStateId", bf);
            var setExit = typeof(StateMachineConfigTab).GetMethod("UpdateTransitionExitTime", bf);
            var setRepeat = typeof(StateMachineConfigTab).GetMethod("UpdateRepeatedTransition", bf);
            if (setCur == null || setDest == null || setExit == null || setRepeat == null)
                throw new Exception("StateMachineConfigTab transition methods not found (LUIDA version mismatch)");
            for (int i = 0; i < sl.States.Length; i++)
            {
                var s = sl.States[i];
                var child = statesRoot.Find(s.StateName);
                if (child == null) throw new Exception("state object not found: " + s.StateName);
                child.SetSiblingIndex(i);
                var transition = child.Find("Transition");
                if (transition == null) throw new Exception("Transition not found under " + s.StateName);
                var g = transition.gameObject;
                setCur.Invoke(tab, new object[] { g, i });
                setDest.Invoke(tab, new object[] { g, Array.FindIndex(sl.States, x => x.StateName == s.DestStateName), s.StateName == "Trial - Rest" });
                setExit.Invoke(tab, new object[] { g, s.HasExitTime, s.ExitTime });
                setRepeat.Invoke(tab, new object[] { g, Mathf.Max(0, Array.FindIndex(sl.States, x => x.StateName == s.RepeatDestStateName)), s.IsRepeated ? s.RepeatCount : 1 });
            }
        }
        finally
        {
            Object.DestroyImmediate(tab);
        }
        Debug.Log("[Study4] states: " + string.Join(", ", sl.States.Select(s => s.StateName)));
        UpdateLayoutAndBehaviours();
    }

    [MenuItem("LUIDA/Study4/Build PhantomTouch scene (no prompt)")]
    public static void BuildNoPrompt()
    {
        Build();
    }

    /// <summary>Batch-mode entry (-executeMethod Study4SceneBuilder.BuildFromBatch).</summary>
    public static void BuildFromBatch()
    {
        try
        {
            Build();
            Debug.Log("[Study4] BUILD OK");
        }
        catch (Exception e)
        {
            Debug.LogError("[Study4] BUILD FAILED: " + e);
            throw;
        }
    }

    public static void Build()
    {
        Debug.Log("[Study4] ---- building scene " + SceneName + " ----");
        CleanPrevious();

        LuidaSceneUtility.CreateNewSceneFromTemplate(SceneName);
        var scene = EditorSceneManager.GetActiveScene();
        if (scene.name != SceneName) throw new Exception("Scene creation failed: active scene is " + scene.name);

        EnsureAutomationAssets();
        var stateList = WriteStateList();
        WriteVariablesJs(stateList);
        WireConditionManagerCombiner();
        BuildStateObjects();
        ConfigureDataCollector();

        var layout = ComputeLayout();
        var materials = CreateMaterials();
        BuildFloorMarker(layout, materials);

        var collectorItem = FindDataCollectorItem();
        var npc = BuildNpc(layout, collectorItem);
        BuildStateListeningItems(layout, materials, npc, collectorItem);

        LuidaScriptCombiner.CombineAll();
        EditorSceneManager.MarkSceneDirty(scene);
        EditorSceneManager.SaveScene(scene);
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("[Study4] ---- done ----");
    }

    // ------------------------------------------------------------------ 0. cleanup
    static void CleanPrevious()
    {
        var active = EditorSceneManager.GetActiveScene();
        if (active.path == ScenePath)
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        string[] paths =
        {
            ScenePath, StateListPath, VariablesPath, DataCollectorConfigPath, DataCollectorJsPath,
            ItemScriptsFolder, AvatarsFolder, PrefabsFolder,
        };
        foreach (var p in paths)
        {
            if (File.Exists(p) || Directory.Exists(p))
            {
                if (!AssetDatabase.DeleteAsset(p))
                {
                    if (Directory.Exists(p)) Directory.Delete(p, true); else File.Delete(p);
                    if (File.Exists(p + ".meta")) File.Delete(p + ".meta");
                }
                Debug.Log("[Study4] removed " + p);
            }
        }
        AssetDatabase.Refresh();
    }

    // ------------------------------------------------------------------ 1. automation assets
    static void EnsureAutomationAssets()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StateListPath));
        Directory.CreateDirectory(Path.GetDirectoryName(VariablesPath));
        if (!File.Exists(StateListPath)) AssetDatabase.CopyAsset(StateListTemplatePath, StateListPath);
        if (!File.Exists(VariablesPath)) File.Copy(VariablesTemplatePath, VariablesPath);
        AssetDatabase.Refresh();
        AssetDatabase.ImportAsset(VariablesPath, ImportAssetOptions.ForceUpdate);
    }

    static StateList.State S(string name, int qID = 0, bool hasExit = false, float exit = 0f)
    {
        return new StateList.State
        {
            StateName = name, DestStateName = "", HasExitTime = hasExit, ExitTime = exit,
            IsRepeated = false, RepeatDestStateName = "", RepeatCount = 1, qID = qID,
        };
    }

    static StateList WriteStateList()
    {
        var sl = AssetDatabase.LoadAssetAtPath<StateList>(StateListPath);
        if (sl == null) throw new Exception("StateList asset missing: " + StateListPath);
        var states = new[]
        {
            S("Start"),                         // task description + OK button (consent is taken at recruitment)
            S("Trial - Start"),                 // block setup (avatar switch) when rep == 1
            S(PoseStateName),                   // head / hand tracking check in front of a mirror (rep == 1)
            S("Trial - Greeting", hasExit: true, exit: GreetingSeconds), // NPC appears; greeting period (rep == 1)
            S("Trial - Touch"),                 // NPC reaches toward the face
            S("Trial - Report"),                // 0-10 rating, manipulation check, type, location
            S("Trial - VEQ", qID: 2),           // VEQ after the 2nd trial of each block (skipped when rep == 1)
            S("Trial - Rest", hasExit: true, exit: RestSeconds),
            S("SocialPresence", qID: 3),
            S("PersonalExperience", qID: 4),
            S("Debrief"),                       // explanation + "OK" button on the instruction board (no questionnaire)
            S("End"),
        };
        for (int i = 0; i < states.Length - 1; i++) states[i].DestStateName = states[i + 1].StateName;
        sl.States = states;
        EditorUtility.SetDirty(sl);
        AssetDatabase.SaveAssets();
        return sl;
    }

    static void WriteVariablesJs(StateList sl)
    {
        var names = string.Join(", ", sl.States.Select(s => "\"" + s.StateName + "\""));
        string js =
            "const trialsCountForEachUniqueCondition = 1;\n" +
            "const within_subjects_variables = [\n" +
            "    { name: \"block\", values: [\"1\", \"2\"], isRandom: false },\n" +
            "    { name: \"rep\", values: [\"1\", \"2\"], isRandom: false },\n" +
            "];\n" +
            "const between_subjects_variables = [\n" +
            "    { name: \"social\", values: [\"with\", \"without\"], isRandom: true, debugValue: null },\n" +
            "    { name: \"order\", values: [\"daily_first\", \"assigned_first\"], isRandom: true, debugValue: null },\n" +
            "];\n" +
            "const state_names = [" + names + "];\n";
        File.WriteAllText(VariablesPath, js);
        AssetDatabase.ImportAsset(VariablesPath, ImportAssetOptions.ForceUpdate);
    }

    static void WireConditionManagerCombiner()
    {
        var cm = GameObject.Find("ConditionManager");
        if (cm == null) throw new Exception("ConditionManager not found in scene");
        var combiner = cm.GetComponent<LuidaScriptCombiner>();
        var variables = AssetDatabase.LoadAssetAtPath<JavaScriptAsset>(VariablesPath);
        var manager = AssetDatabase.LoadAssetAtPath<JavaScriptAsset>(ConditionManagerJsPath);
        combiner.ClearScripts();
        combiner.AppendScript(variables, null);
        combiner.AppendScript(manager, null, true);
        EditorUtility.SetDirty(combiner);
    }

    // State GameObjects + per-state questionnaire forms, via LUIDA's own State Machine tab logic.
    static void BuildStateObjects()
    {
        var tab = ScriptableObject.CreateInstance<StateMachineConfigTab>();
        try
        {
            tab.OnEnable();
            var update = typeof(StateMachineConfigTab).GetMethod("UpdateSceneObjects", BindingFlags.NonPublic | BindingFlags.Instance);
            if (update == null) throw new Exception("StateMachineConfigTab.UpdateSceneObjects not found (LUIDA version mismatch)");
            update.Invoke(tab, null);
        }
        finally
        {
            Object.DestroyImmediate(tab);
        }
        // sanity
        var states = GameObject.Find("States");
        if (states == null || states.transform.childCount != 12)
            throw new Exception("States container not generated as expected");
        var qRoot = GameObject.Find("LUIDA-QuestionnaireByState");
        if (qRoot == null || qRoot.transform.childCount != 3)
            Debug.LogWarning("[Study4] expected 3 questionnaire containers, found " + (qRoot ? qRoot.transform.childCount : 0));
        // Questionnaire containers start inactive; the state's Set Game Object Active gimmick
        // (copied onto each container) activates them when their state begins.
        if (qRoot != null)
            for (int i = 0; i < qRoot.transform.childCount; i++)
                qRoot.transform.GetChild(i).gameObject.SetActive(false);
    }

    // ------------------------------------------------------------------ 2. data collector
    static void ConfigureDataCollector()
    {
        var config = DataCollectorCreateMenu.FindOrCreateBuilderConfig();
        if (config == null) throw new Exception("Data collector config not found");
        config.useCustomCodeMode = true;
        config.rawJs = DataCollectorJs;
        config.collectedLabels.Clear();
        foreach (var (label, type) in new (string, CollectedValueType)[]
                 {
                     ("avatar", CollectedValueType.String), ("rating", CollectedValueType.Integer), ("mc", CollectedValueType.Integer),
                     ("ptype", CollectedValueType.String), ("ploc", CollectedValueType.String), ("trace", CollectedValueType.String),
                     ("ptypeOther", CollectedValueType.String), ("plocOther", CollectedValueType.String),
                 })
        {
            // Registered as String so that no CCK sync header is generated; values are written by scripts.
            config.collectedLabels.Add(new CollectedLabel { label = label, type = CollectedValueType.String });
        }
        EditorUtility.SetDirty(config);
        AssetDatabase.SaveAssets();
        DataCollectorJsSaver.WriteAndCombine(config);
    }

    const string DataCollectorJs = @"// Study 4 (phantom touch): one row per trial / setup / device check.
// Written by Study4SceneBuilder (Code mode). Values are pushed by the state-listening items
// (SendDataToCollector) and by the NPC item (group state). Labels that a row does not use keep
// the value of the previous save, so interpret rows by stateLog.name.
const CD = (typeof COLLECTED_DATA !== 'undefined' && COLLECTED_DATA) ? COLLECTED_DATA : {};
return {
    stateLog: CD['stateLog'],
    cond: CONDITION || {},
    savedAt: Date.now(),
    // block setup (Trial - Start, rep == 1)
    avatar: CD['avatar'],
    avatarArmLen: CD['avatarArmLen'], avatarShoulder: CD['avatarShoulder'],
    avatarHeadH: CD['avatarHeadH'], avatarHipsH: CD['avatarHipsH'], avatarIsDefault: CD['avatarIsDefault'],
    setupSec: CD['setupSec'], setupRetry: CD['setupRetry'], avatarCheckFallback: CD['avatarCheckFallback'],
    // device check
    deviceCheckSec: CD['deviceCheckSec'], deviceCheckForced: CD['deviceCheckForced'],
    // per-trial report
    rating: CD['rating'], mc: CD['mc'], ptype: CD['ptype'], ploc: CD['ploc'], reportDoneTs: CD['reportDoneTs'],
    ptypeOther: CD['ptypeOther'], plocOther: CD['plocOther'],
    // NPC measurements
    social: CD['social'], npcBlock: CD['npcBlock'], npcRep: CD['npcRep'], npcAvatar: CD['npcAvatar'],
    trialStartTs: CD['trialStartTs'], reachStartTs: CD['reachStartTs'], contactTs: CD['contactTs'], retractEndTs: CD['retractEndTs'],
    strokeEndTs: CD['strokeEndTs'], strokeAmp: CD['strokeAmp'], strokeCycles: CD['strokeCycles'],
    strokeBack: CD['strokeBack'], strokeReturnSpeed: CD['strokeReturnSpeed'],
    // greeting period (written on both trials of the block)
    greetSec: CD['greetSec'], greetGazeEvents: CD['greetGazeEvents'], greetHandRaises: CD['greetHandRaises'],
    greetNpcReactions: CD['greetNpcReactions'], greetNpcNods: CD['greetNpcNods'], greetNpcWaves: CD['greetNpcWaves'],
    greetNpcSmiles: CD['greetNpcSmiles'], greetNpcIdleReactions: CD['greetNpcIdleReactions'], greetTouches: CD['greetTouches'],
    // height matching (head-bone heights, m; platform under the participant / riser under the NPC)
    participantHeadH: CD['participantHeadH'], npcHeadH: CD['npcHeadH'], heightPlatform: CD['heightPlatform'], npcLift: CD['npcLift'],
    pathLen: CD['pathLen'], reachDur: CD['reachDur'], contactDist: CD['contactDist'], reachable: CD['reachable'],
    headPos0: CD['headPos0'], headRot0: CD['headRot0'],
    retreatOnsetDist: CD['retreatOnsetDist'], retreatDist: CD['retreatDist'], oscAmp: CD['oscAmp'],
    lookedAtNpc: CD['lookedAtNpc'], lookTs: CD['lookTs'], greeted: CD['greeted'],
    npcTimeout: CD['npcTimeout'],
    trace: CD['trace'],
};
";

    // ------------------------------------------------------------------ 3. layout
    class Layout
    {
        public Vector3 origin;   // participant standing spot (floor)
        public Vector3 fwd;      // participant facing direction (horizontal)
        public Vector3 right;
        public Vector3 P(float r, float u, float f) => origin + right * r + Vector3.up * u + fwd * f;
        public Quaternion FaceAwayFromViewer(Vector3 pos)
        {
            var viewer = origin + Vector3.up * 1.5f;
            var d = pos - viewer; d.y = 0;
            return Quaternion.LookRotation(d.sqrMagnitude > 1e-6f ? d.normalized : fwd, Vector3.up);
        }
        public Vector3 Eye => origin + Vector3.up * EyeHeight;
        public Quaternion Frame => Quaternion.LookRotation(fwd, Vector3.up);
        // yaw from the facing direction (deg, + = right), horizontal distance from the standing spot, height
        public Vector3 Around(float yawDeg, float dist, float height)
        {
            float r = yawDeg * Mathf.Deg2Rad;
            return origin + (right * Mathf.Sin(r) + fwd * Mathf.Cos(r)) * dist + Vector3.up * height;
        }
        // +Z from the eye to pos (pitch included), so a TextView or quad at pos is seen face-on
        public Quaternion FaceEye(Vector3 pos) => Quaternion.LookRotation((pos - Eye).normalized, Vector3.up);
    }

    static Layout ComputeLayout()
    {
        Transform spawn = null;
        var sp = GameObject.Find("SpawnPoints");
        if (sp != null && sp.transform.childCount > 0) spawn = sp.transform.GetChild(0);
        var l = new Layout();
        l.origin = spawn != null ? spawn.position : Vector3.zero;
        var f = spawn != null ? spawn.forward : Vector3.forward;
        f.y = 0; if (f.sqrMagnitude < 1e-6f) f = Vector3.forward;
        l.fwd = f.normalized;
        l.right = Vector3.Cross(Vector3.up, l.fwd).normalized;
        Debug.Log("[Study4] layout origin=" + l.origin + " fwd=" + l.fwd);
        return l;
    }

    class Materials { public Material btn, btnOn, marker, panel, riser, insBg, gateBg, dcBg, rpBg; }

    static Materials CreateMaterials()
    {
        Directory.CreateDirectory(MaterialsFolder);
        var m = new Materials
        {
            btn = MakeMaterial("Btn", new Color(0.18f, 0.20f, 0.25f)),
            btnOn = MakeMaterial("BtnOn", new Color(0.95f, 0.55f, 0.15f)),
            marker = MakeMaterial("FloorMarker", new Color(0.35f, 0.60f, 0.90f)),
            panel = MakeMaterial("Panel", new Color(0.10f, 0.10f, 0.12f)),
            riser = MakeMaterial("Riser", new Color(0.42f, 0.44f, 0.48f)),   // height platform / NPC riser
            // semi-transparent backings, one hue per text group so texts shown together are easy to tell apart
            insBg = MakeTransparentMaterial("BgInstruction", new Color(0.06f, 0.12f, 0.30f, 0.70f)),
            gateBg = MakeTransparentMaterial("BgAvatarGate", new Color(0.26f, 0.08f, 0.30f, 0.70f)),
            dcBg = MakeTransparentMaterial("BgDeviceCheck", new Color(0.04f, 0.24f, 0.20f, 0.70f)),
            rpBg = MakeTransparentMaterial("BgReport", new Color(0.32f, 0.17f, 0.03f, 0.70f)),
        };
        AssetDatabase.SaveAssets();
        return m;
    }

    static Material MakeMaterial(string name, Color color)
    {
        string path = MaterialsFolder + "/" + name + ".mat";
        var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (existing != null) { existing.color = color; EditorUtility.SetDirty(existing); return existing; }
        var shader = Shader.Find("Standard") ?? Shader.Find("Universal Render Pipeline/Lit");
        var mat = new Material(shader) { color = color };
        AssetDatabase.CreateAsset(mat, path);
        return mat;
    }

    // Standard shader in Fade mode, drawn just before the text (ZTestText, queue 3000) so the text stays on top.
    static Material MakeTransparentMaterial(string name, Color color)
    {
        string path = MaterialsFolder + "/" + name + ".mat";
        var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
        bool create = mat == null;
        if (create) mat = new Material(Shader.Find("Standard"));
        mat.color = color;
        mat.SetFloat("_Mode", 2f);
        mat.SetOverrideTag("RenderType", "Transparent");
        mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
        mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
        mat.SetInt("_ZWrite", 0);
        mat.DisableKeyword("_ALPHATEST_ON");
        mat.EnableKeyword("_ALPHABLEND_ON");
        mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
        mat.SetFloat("_Glossiness", 0f);
        mat.SetFloat("_Metallic", 0f);
        mat.SetFloat("_SpecularHighlights", 0f);
        mat.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");
        mat.SetFloat("_GlossyReflections", 0f);
        mat.EnableKeyword("_GLOSSYREFLECTIONS_OFF");
        mat.EnableKeyword("_EMISSION");
        mat.SetColor("_EmissionColor", new Color(color.r, color.g, color.b) * 0.6f);
        mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
        mat.renderQueue = 2990;
        if (create) AssetDatabase.CreateAsset(mat, path);
        else EditorUtility.SetDirty(mat);
        return mat;
    }

    // ------------------------------------------------------------------ 3b. UI layout
    // Placement is relative to the participant's standing spot: yaw from the facing direction (deg,
    // + = right), horizontal distance and height. CCK TextView glyph metrics (Noto Sans CJK): a full-width
    // glyph is about 1.85 x size wide and a line 2.74 x size tall (size 0.024 at 1.5 m = ~1.7 deg per glyph).
    // Line length depends on the free space around each spot (full-width glyphs): front (above the NPC, next to
    // the mirror) <= 20, above the questionnaire <= 26, center (nothing else shown) <= 26 / 30 in the debrief,
    // avatar gate and report panels (straight ahead) <= 24. What is shown together, and where:
    //   questionnaire (2.5 x 2 m, 2 m ahead, yaw +-32 deg) + instruction "above" slot (just above its top edge)
    //   NPC (ahead) + instruction "front" slot (above the NPC's head) + mirror (front-left, greeting/touch)
    //   trial start: avatar gate (straight ahead, NPC hidden) + avatar menu photos (right of it) + mirror (front-left)
    //   pose check: front mirror (straight ahead, below the front slot) + device check panel (right)
    //   report: report panel (straight ahead, NPC hidden)
    //   debrief / end: instruction "center" slot (straight ahead) with the OK button below it
    // The instruction's backing quad ("Bg") is scaled to the text by ins_show() (Transform.localScale via unityProp).
    const float EyeHeight = 1.55f;
    const float GlyphW = 1.85f, LineH = 2.74f;
    const float InsSize = 0.024f, InsDist = 1.5f, InsFrontElevDeg = 23f;
    const float InsBoardW = 0.74f, InsBoardPad = 0.05f;
    // LUIDA questionnaire form (Questionnaire_p1): centre 2 m ahead at 1.5 m, 2.5 m wide, 2 m tall, 0.16 m deep
    const float QuestFwd = 2.0f, QuestCenterHeight = 1.5f, QuestHeight = 2.0f;
    const float InsAboveSize = 0.03f, InsAboveGap = 0.05f, InsAboveBack = 0.3f;   // text centre above the form's top edge, in front of it
    const float InsDebriefSize = 0.022f;
    // The avatar gate (trial start) and the report panel (after each touch) are straight ahead: the NPC is hidden
    // in both states. The device check stays on the right (the participant turns the head left and right there).
    const float PanelTextSize = 0.018f, PanelDist = 1.25f, FrontPanelYawDeg = 0f, RightPanelYawDeg = 40f;
    const float MirrorYawDeg = -45f, MirrorDist = 1.3f, MirrorCenterHeight = 1.2f, MirrorW = 1.2f, MirrorH = 1.8f;
    // Pose check: a second mirror ("MirrorFront") straight ahead, behind the front instruction slot and below its
    // text (top edge ~16 deg up vs the 3-line text's bottom ~19 deg), clear of the device check panel on the right.
    // Seen from 1.6 m it shows the whole avatar, hands raised above the head included.
    const float PoseMirrorDist = 1.6f, PoseMirrorCenterHeight = 1.1f, PoseMirrorW = 1.2f, PoseMirrorH = 1.8f;
    // Photos of how to switch the avatar ("MenuPhoto1", "MenuPhoto2", children of the AvatarGate item), stacked top to
    // bottom right of the gate's backing (which ends ~20 deg right), each MenuPhotoW wide keeping the image's aspect,
    // the column centred at MenuPhotoHeight. 1: open the menu and tap "Avatar"; 2: pick "LUIDA Default Avatar" and
    // press "Change avatar" (shown only when the Default Avatar is the one to wear).
    const string MenuPhotoFolder = "Assets/_Experiment_/Textures/" + SceneName;
    static readonly string[] MenuPhotoFiles = { "open-menu.png", "open-avatar-menu.png" };
    const float MenuPhotoYawDeg = 33.5f, MenuPhotoHeight = 1.30f, MenuPhotoW = 0.52f, MenuPhotoGap = 0.03f;
    const int RpCols = 4;   // numeric report options (0-10, 1-7): 4 x 3 grid filled row by row
    const float RpBtnW = 0.16f, RpBtnH = 0.10f, RpPitchX = 0.175f, RpPitchY = 0.115f;
    // Word report options (sensation type, location): a separate 2 x 4 grid of wider buttons RPW_0..7 whose labels
    // (up to 2 lines x 10 full-width glyphs) use the question's text size; a click writes rp_btn = RpWordValue0 + i.
    // Its top edge is level with the numeric grid's; the Done button sits below it.
    const int RpWordCols = 2, RpWordCount = 8, RpWordValue0 = 21;
    const float RpWordW = 0.38f, RpWordH = 0.115f, RpWordPitchX = 0.41f, RpWordPitchY = 0.13f, RpWordTopY = 0.3225f;
    const float RpHeight = 1.05f, RpDoneY = -0.19f;

    // Debrief / End: nothing else is shown, so the text sits straight ahead with the Debrief "OK" button below
    const float InsCenterHeight = EyeHeight + 0.10f, DebriefOkHeight = EyeHeight - 0.47f;
    const int EndGateDelaySec = 10;   // End: countdown, then the participant is teleported into the exit gate
    // The exit gate is parked this far from the ExitPortal (item-local), so no gate is ever left at the spawn point
    // for the next participant who joins the same space (session reset).
    static readonly Vector3 ExitGateOffset = new Vector3(100f, 100f, 100f);

    static Vector3 InsFrontPos(Layout l) => l.Around(0f, InsDist, EyeHeight + InsDist * Mathf.Tan(InsFrontElevDeg * Mathf.Deg2Rad));
    static Vector3 InsCenterPos(Layout l) => l.Around(0f, InsDist, InsCenterHeight);
    static Vector3 InsAbovePos(Layout l) => l.Around(0f, QuestFwd - InsAboveBack, QuestCenterHeight + QuestHeight * 0.5f + InsAboveGap);

    /// <summary>
    /// Places the Study 4 UI on the existing scene objects: instruction board, side panels and their
    /// buttons, the coloured backings (children of each Text, so they show and hide with it) and the
    /// mirror. Shared by the full build and "Update layout and behaviours (keep scene)".
    /// </summary>
    static void ApplyLayout(Layout l, Materials m)
    {
        // Instruction: the item sits at the standing spot; ins_show() (InstructionLegacy) moves its Text
        // between the front and side slots and enables the backing Bg_<line count>.
        var ins = FindRoot("Instruction");
        if (ins != null)
        {
            ins.SetPositionAndRotation(l.origin, l.Frame);
            var text = ins.Find("Text");
            if (text != null)
            {
                var front = InsFrontPos(l);
                text.SetPositionAndRotation(front, l.FaceEye(front));
                SetTextStyle(text, InsSize, TextAnchor.MiddleCenter);
                // one backing, scaled to the text by ins_show(); the older per-line-count backings are removed
                Backing(text, "Bg", m.insBg, Vector2.zero, new Vector2(InsBoardW, 3 * LineH * InsSize + InsBoardPad), 0.01f)
                    .gameObject.SetActive(false);
                for (int n = 1; n <= 9; n++) { var old = text.Find("Bg_" + n); if (old != null) Object.DestroyImmediate(old.gameObject); }
            }
        }

        // Debrief "OK" button (a separate item; clicks write the Integer state "ins_btn" on the Instruction item)
        if (ins != null)
        {
            var dbGroup = FindRoot("DebriefUI", false);
            if (dbGroup == null) dbGroup = new GameObject("DebriefUI").transform;
            var okPos = l.Around(0f, InsDist, DebriefOkHeight);
            dbGroup.SetPositionAndRotation(okPos, l.FaceEye(okPos));
            var okSize = new Vector3(0.24f, 0.09f, 0.04f);
            if (dbGroup.Find("DB_Ok") == null)
                CreateButton(dbGroup, "DB_Ok", "OK", Vector3.zero, okSize, ins.GetComponent<Item>(), "ins_btn", 1, m, 0.03f);
            AddWorldItemReference(ins.gameObject, "DB_Ok", dbGroup.Find("DB_Ok").GetComponent<Item>());
            SetButton(dbGroup, "DB_Ok", Vector3.zero, okSize, 0.03f, "OK");
        }

        // AvatarGate (straight ahead): text grows upwards from just above the buttons; "Changed" and Yes/No are
        // on separate rows so a double click on "Changed" cannot answer the confirmation.
        var gate = PlacePanel(l, "AvatarGateUI", "AvatarGate", FrontPanelYawDeg, 1.2f, 0.065f, m.gateBg, new Rect(-0.45f, -0.16f, 0.90f, 0.52f));
        SetButton(gate, "AG_Changed", new Vector3(0f, 0f, 0f), new Vector3(0.30f, 0.08f, 0.04f), 0.02f);
        SetButton(gate, "AG_Yes", new Vector3(-0.10f, -0.10f, 0f), new Vector3(0.17f, 0.08f, 0.04f), 0.02f);
        SetButton(gate, "AG_No", new Vector3(0.10f, -0.10f, 0f), new Vector3(0.17f, 0.08f, 0.04f), 0.02f);
        var gateItem = gate != null ? gate.Find("AvatarGate") : null;
        if (gateItem != null) PlaceMenuPhotos(l, gateItem, m);

        // DeviceCheck (right)
        var dc = PlacePanel(l, "DeviceCheckUI", "DeviceCheck", RightPanelYawDeg, 1.25f, 0.075f, m.dcBg, new Rect(-0.29f, -0.07f, 0.58f, 0.33f));
        SetButton(dc, "DC_Force", Vector3.zero, new Vector3(0.36f, 0.10f, 0.04f), 0.016f, DcForceLabel);

        // ReportPanel (straight ahead, below the instruction board): numbers on the RP_* grid, word options on the
        // wider RPW_* grid (created here when missing), "Done" below them. The backing covers the taller word grid.
        var rp = PlacePanel(l, "ReportPanelUI", "ReportPanel", FrontPanelYawDeg, RpHeight, 0.40f, m.rpBg, new Rect(-0.44f, RpDoneY - 0.08f, 0.88f, 0.70f - RpDoneY));
        for (int i = 0; i <= 10; i++)
        {
            int r = i / RpCols, c = i % RpCols;
            SetButton(rp, "RP_" + i, new Vector3((c - (RpCols - 1) * 0.5f) * RpPitchX, 0.10f + (2 - r) * RpPitchY, 0f),
                new Vector3(RpBtnW, RpBtnH, 0.04f), 0.024f);
        }
        var rpItem = rp != null ? rp.Find("ReportPanel") : null;
        for (int i = 0; i < RpWordCount; i++)
        {
            string id = "RPW_" + i;
            int r = i / RpWordCols, c = i % RpWordCols;
            var pos = new Vector3((c - (RpWordCols - 1) * 0.5f) * RpWordPitchX, RpWordTopY - r * RpWordPitchY, 0f);
            var size = new Vector3(RpWordW, RpWordH, 0.04f);
            if (rpItem == null) break;
            if (rp.Find(id) == null)
                CreateButton(rp, id, "", pos, size, rpItem.GetComponent<Item>(), "rp_btn", RpWordValue0 + i, m, PanelTextSize);
            AddWorldItemReference(rpItem.gameObject, id, rp.Find(id).GetComponent<Item>());
            SetButton(rp, id, pos, size, PanelTextSize);
        }
        SetButton(rp, "RP_Done", new Vector3(0f, RpDoneY, 0f), new Vector3(0.26f, 0.08f, 0.04f), 0.02f);

        // ExitPortal at the standing spot; the gate is parked far away and ep_update() teleports the participant into it.
        var ep = FindRoot("ExitPortal");
        if (ep != null)
        {
            ep.SetPositionAndRotation(l.origin, l.Frame);
            ParkExitGate();
        }

        // Mirror (front-left, facing the participant): close enough to see one's own avatar and the NPC's
        // hand at one's face; clear of the NPC and of the front instruction slot.
        var mp = FindRoot("MirrorPanel");
        if (mp != null)
        {
            var pos = l.Around(MirrorYawDeg, MirrorDist, MirrorCenterHeight);
            mp.SetPositionAndRotation(pos, l.FaceAwayFromViewer(pos));
            var mir = mp.Find("Mirror");
            if (mir != null)
            {
                mir.localPosition = Vector3.zero;
                mir.localRotation = Quaternion.identity;
                mir.localScale = new Vector3(MirrorW, MirrorH, 1f);
            }
            var front = mp.Find("MirrorFront");
            if (front == null)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(MirrorPrefabPath);
                if (prefab != null)
                {
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, mp);
                    go.name = "MirrorFront";
                    go.SetActive(false);
                    front = go.transform;
                }
                else Debug.LogWarning("[Study4] CCK Mirror prefab not found at " + MirrorPrefabPath);
            }
            if (front != null)
            {
                var fp = l.Around(0f, PoseMirrorDist, PoseMirrorCenterHeight);
                front.SetPositionAndRotation(fp, l.FaceAwayFromViewer(fp));
                front.localScale = new Vector3(PoseMirrorW, PoseMirrorH, 1f);
            }
        }

        EnsureHeightObjects(l, m);

        // Face expressions on whatever model the scene's NPC carries now (the prefab's model may have been replaced)
        var npcRoot = FindRoot("NPC", false);
        if (npcRoot != null) AttachFaceExpression(npcRoot.gameObject, EnsureFaceAssets(false));
        EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
    }

    // Unlit quads (no collider) facing the eye, one per MenuPhotoFiles entry, stacked top to bottom; inactive until
    // AvatarGate shows them (ag_photos). The images are imported without power-of-two rescaling so the text stays sharp.
    static void PlaceMenuPhotos(Layout l, Transform gateItem, Materials m)
    {
        var oldSingle = gateItem.Find("MenuPhoto");   // earlier single placeholder photo
        if (oldSingle != null) Object.DestroyImmediate(oldSingle.gameObject);
        int n = MenuPhotoFiles.Length;
        var tex = new Texture2D[n];
        var h = new float[n];
        float total = 0f;
        for (int i = 0; i < n; i++)
        {
            string path = MenuPhotoFolder + "/" + MenuPhotoFiles[i];
            var imp = AssetImporter.GetAtPath(path) as TextureImporter;
            if (imp != null && (imp.npotScale != TextureImporterNPOTScale.None || imp.textureCompression != TextureImporterCompression.CompressedHQ || imp.maxTextureSize != 2048))
            {
                imp.npotScale = TextureImporterNPOTScale.None;
                imp.textureCompression = TextureImporterCompression.CompressedHQ;
                imp.maxTextureSize = 2048;
                imp.mipmapEnabled = true;
                imp.anisoLevel = 4;
                imp.SaveAndReimport();
            }
            tex[i] = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            float aspect = 16f / 9f;
            if (tex[i] == null) Debug.LogWarning("[Study4] avatar menu photo not found: " + path);
            else
            {
                int sw = tex[i].width, sh = tex[i].height;
                if (imp != null) imp.GetSourceTextureWidthAndHeight(out sw, out sh);
                if (sw > 0 && sh > 0) aspect = (float)sw / sh;
            }
            h[i] = MenuPhotoW / aspect;
            total += h[i] + (i > 0 ? MenuPhotoGap : 0f);
        }
        float top = MenuPhotoHeight + total * 0.5f;
        var ps = gateItem.lossyScale;
        for (int i = 0; i < n; i++)
        {
            string name = "MenuPhoto" + (i + 1);
            var t = gateItem.Find(name);
            if (t == null)
            {
                var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
                q.name = name;
                t = q.transform;
                t.SetParent(gateItem, false);
            }
            var col = t.GetComponent<Collider>();
            if (col != null) Object.DestroyImmediate(col);
            var pos = l.Around(MenuPhotoYawDeg, PanelDist, top - h[i] * 0.5f);
            t.SetPositionAndRotation(pos, l.FaceEye(pos));
            t.localScale = new Vector3(MenuPhotoW / ps.x, h[i] / ps.y, 1f);
            top -= h[i] + MenuPhotoGap;

            string matPath = MaterialsFolder + "/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (mat == null)
            {
                mat = new Material(Shader.Find("Unlit/Texture"));
                AssetDatabase.CreateAsset(mat, matPath);
            }
            mat.mainTexture = tex[i];
            EditorUtility.SetDirty(mat);
            var r = t.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            t.gameObject.SetActive(false);
        }
    }

    // Height matching (NpcController.js, npc_show): head-bone heights are compared per block. A shorter
    // participant stands on the HeightPlatform item's "Cube" (raised by the message "platform_set" { h },
    // Study4Platform.js); a shorter NPC stands on its "Riser" sub-node. Both cubes are 1 m tall with the top at
    // the feet when not raised (fully underground), so only the raised part ever shows.
    static readonly Vector3 PlatformSize = new Vector3(1.6f, 1f, 1.6f);
    static readonly Vector3 RiserSize = new Vector3(0.8f, 1f, 0.8f);

    static void EnsureHeightObjects(Layout l, Materials m)
    {
        var platform = FindRoot(HeightPlatformName, false);
        if (platform == null)
        {
            var go = new GameObject(HeightPlatformName);
            platform = go.transform;
            SetItemName(go.AddComponent<Item>(), HeightPlatformName);
            var js = AssetDatabase.LoadAssetAtPath<JavaScriptAsset>(PlatformJsPath);
            if (js == null) throw new Exception("Study4Platform.js not importable: " + PlatformJsPath);
            var scriptable = go.AddComponent<ScriptableItem>();
            var so = new SerializedObject(scriptable);
            so.FindProperty("sourceCodeAsset").objectReferenceValue = js;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
        platform.SetPositionAndRotation(l.origin, l.Frame);
        EnsureCube(platform, "Cube", PlatformSize, m.riser, true);

        var npc = FindRoot("NPC");
        if (npc != null)
        {
            EnsureCube(npc, "Riser", RiserSize, m.riser, false);
            AddWorldItemReference(npc.gameObject, HeightPlatformName, platform.GetComponent<Item>());
        }
    }

    // A cube whose top is at the parent's origin (local y from -height to 0); inactive until a script raises it.
    static void EnsureCube(Transform parent, string name, Vector3 size, Material mat, bool collider)
    {
        var t = parent.Find(name);
        if (t == null)
        {
            var c = GameObject.CreatePrimitive(PrimitiveType.Cube);
            c.name = name;
            t = c.transform;
            t.SetParent(parent, false);
        }
        var col = t.GetComponent<Collider>();
        if (!collider && col != null) Object.DestroyImmediate(col);
        if (collider && col == null) t.gameObject.AddComponent<BoxCollider>();
        t.localPosition = new Vector3(0f, -size.y * 0.5f, 0f);
        t.localRotation = Quaternion.identity;
        t.localScale = size;
        var r = t.GetComponent<MeshRenderer>();
        r.sharedMaterial = mat;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        t.gameObject.SetActive(false);
    }

    // Sets one state's exit time in the state list asset and in the generated state object (the Transition's
    // ItemTimer, as LUIDA's state machine tab writes it), without regenerating the state machine.
    static void SetStateExitTime(string stateName, float seconds)
    {
        var sl = AssetDatabase.LoadAssetAtPath<StateList>(StateListPath);
        if (sl == null) { Debug.LogWarning("[Study4] state list not found: " + StateListPath); return; }
        var so = new SerializedObject(sl);
        var states = so.FindProperty("States");
        bool found = false;
        for (int i = 0; i < states.arraySize; i++)
        {
            var st = states.GetArrayElementAtIndex(i);
            if (st.FindPropertyRelative("StateName").stringValue != stateName) continue;
            st.FindPropertyRelative("HasExitTime").boolValue = true;
            st.FindPropertyRelative("ExitTime").floatValue = seconds;
            found = true;
        }
        if (!found) { Debug.LogWarning("[Study4] state not in the state list: " + stateName); return; }
        so.ApplyModifiedPropertiesWithoutUndo();
        AssetDatabase.SaveAssets();

        // the state objects live under LUIDA-ExpManagers/States (older scenes: a root "States")
        var managers = FindRoot("LUIDA-ExpManagers", false);
        var statesRoot = managers != null ? managers.Find("States") : null;
        if (statesRoot == null) statesRoot = FindRoot("States", false);
        var transition = statesRoot != null ? statesRoot.Find(stateName + "/Transition") : null;
        if (transition == null) { Debug.LogWarning("[Study4] state object not found in the scene: " + stateName); return; }
        foreach (var timer in transition.GetComponents<ItemTimer>())
        {
            var tso = new SerializedObject(timer);
            var key = tso.FindProperty("key.key");
            if (key == null || (key.stringValue != "state_enter" && key.stringValue != "state_enter(disabled)")) continue;
            key.stringValue = "state_enter";
            tso.FindProperty("delayTimeSeconds").floatValue = seconds;
            tso.ApplyModifiedPropertiesWithoutUndo();
            break;
        }
        Debug.Log("[Study4] exit time of '" + stateName + "' set to " + seconds + " s");
    }

    static Transform FindRoot(string name, bool warn = true)
    {
        var go = SceneManager.GetActiveScene().GetRootGameObjects().FirstOrDefault(g => g.name == name);
        if (go == null && warn) Debug.LogWarning("[Study4] scene object not found: " + name);
        return go != null ? go.transform : null;
    }

    // Panel group (buttons) facing the eye; the state-listening item's Text sits textY above the button row
    // with its backing covering `board` (group coordinates; x, y = lower-left corner).
    static Transform PlacePanel(Layout l, string groupName, string itemName, float yawDeg, float height, float textY, Material bgMat, Rect board)
    {
        var g = FindRoot(groupName);
        if (g == null) return null;
        var pos = l.Around(yawDeg, PanelDist, height);
        g.SetPositionAndRotation(pos, l.FaceEye(pos));
        var item = g.Find(itemName);
        var text = item != null ? item.Find("Text") : null;
        if (text == null) { Debug.LogWarning("[Study4] " + groupName + "/" + itemName + "/Text not found"); return g; }
        item.localPosition = Vector3.zero;
        item.localRotation = Quaternion.identity;
        text.localPosition = new Vector3(0f, textY, 0f);
        text.localRotation = Quaternion.identity;
        SetTextStyle(text, PanelTextSize, TextAnchor.LowerCenter);
        Backing(text, "Bg", bgMat, new Vector2(board.center.x, board.center.y - textY), board.size, 0.035f);
        return g;
    }

    static void SetTextStyle(Transform t, float size, TextAnchor anchor)
    {
        var tv = t.GetComponent<TextView>();
        if (tv == null) return;
        var so = new SerializedObject(tv);
        so.FindProperty("size").floatValue = size;
        so.FindProperty("textAnchor").enumValueIndex = (int)anchor;
        so.FindProperty("textAlignment").enumValueIndex = (int)TextAlignment.Center;
        so.ApplyModifiedPropertiesWithoutUndo();
    }

    // Semi-transparent quad behind a text (local +Z is away from the reader). No collider, so it never
    // blocks button clicks.
    static Transform Backing(Transform parent, string name, Material mat, Vector2 center, Vector2 size, float behind)
    {
        var t = parent.Find(name);
        if (t == null)
        {
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            q.name = name;
            Object.DestroyImmediate(q.GetComponent<Collider>());
            t = q.transform;
            t.SetParent(parent, false);
        }
        t.localPosition = new Vector3(center.x, center.y, behind);
        t.localRotation = Quaternion.identity;
        t.localScale = new Vector3(size.x, size.y, 1f);
        var r = t.GetComponent<MeshRenderer>();
        r.sharedMaterial = mat;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        return t;
    }

    static void SetButton(Transform group, string id, Vector3 pos, Vector3 size, float labelSize, string label = null)
    {
        var b = group != null ? group.Find(id) : null;
        if (b == null) { Debug.LogWarning("[Study4] button not found: " + id); return; }
        b.localPosition = pos;
        b.localRotation = Quaternion.identity;
        var v = b.Find("Visual");
        if (v != null) v.localScale = size;
        var vo = b.Find("VisualOn");
        if (vo != null) vo.localScale = size * 1.06f;
        var lab = b.Find("Label");
        var tv = lab != null ? lab.GetComponent<TextView>() : null;
        if (tv == null) return;
        lab.localPosition = new Vector3(0f, 0f, -size.z * 0.5f - 0.005f);
        var so = new SerializedObject(tv);
        so.FindProperty("size").floatValue = labelSize;
        if (label != null) so.FindProperty("text").stringValue = label;
        so.ApplyModifiedPropertiesWithoutUndo();
    }

    static void BuildFloorMarker(Layout l, Materials m)
    {
        var marker = GameObject.CreatePrimitive(PrimitiveType.Quad);
        marker.name = "FloorMarker";
        Object.DestroyImmediate(marker.GetComponent<Collider>());
        marker.transform.position = l.origin + Vector3.up * 0.01f;
        marker.transform.rotation = Quaternion.Euler(90f, Quaternion.LookRotation(l.fwd).eulerAngles.y, 0f);
        marker.transform.localScale = new Vector3(0.6f, 0.6f, 1f);
        marker.GetComponent<MeshRenderer>().sharedMaterial = m.marker;
    }

    // ------------------------------------------------------------------ 4. NPC
    static Item FindDataCollectorItem()
    {
        foreach (var root in SceneManager.GetActiveScene().GetRootGameObjects())
        {
            if (PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(root) == DataCollectorPrefabPath)
                return root.GetComponent<Item>();
        }
        var dc = Object.FindFirstObjectByType<LuidaDataCollector>();
        return dc != null ? dc.GetComponent<Item>() : null;
    }

    static GameObject BuildNpc(Layout l, Item collectorItem)
    {
        var registry = AvatarsConfigAssetUtil.EnsureRegistryAsset();
        if (registry == null) throw new Exception("Avatar registry could not be created");
        var vrm = AssetDatabase.LoadAssetAtPath<GameObject>(NpcVrmPath);
        if (vrm == null) throw new Exception("NPC VRM not found: " + NpcVrmPath);

        var entry = new AvatarEntry
        {
            avatarID = "NpcBody", displayName = "NPC body (YoungAvatar)", sourceVrmPrefab = vrm,
            scaleMode = AvatarScaleMode.OriginalScale, syncHipsY = true, hipsYOffset = 0f,
        };
        string wrapperPath = VrmWrapperBuilder.Build(vrm, entry, registry);
        if (wrapperPath == null) throw new Exception("VrmWrapperBuilder failed for NPC");

        string sceneFolder = AvatarsConfigAssetUtil.GetSceneFolderFromRegistry(registry);
        string boneMapPath = AvatarsConfigAssetUtil.GetGeneratedFolder(sceneFolder) + "/NpcBody_BoneMap.js";
        AppendEyeBonesToBoneMap(boneMapPath, vrm);
        string npcBoneMapPath = AvatarsConfigAssetUtil.GetGeneratedFolder(sceneFolder) + "/NPC_BoneMap.js";
        if (File.Exists(npcBoneMapPath)) AssetDatabase.DeleteAsset(npcBoneMapPath);
        AssetDatabase.MoveAsset(boneMapPath, npcBoneMapPath);
        AssetDatabase.ImportAsset(npcBoneMapPath, ImportAssetOptions.ForceUpdate);

        var boneMapAsset = AssetDatabase.LoadAssetAtPath<JavaScriptAsset>(npcBoneMapPath);
        var controllerAsset = AssetDatabase.LoadAssetAtPath<JavaScriptAsset>(NpcControllerJsPath);
        if (boneMapAsset == null || controllerAsset == null) throw new Exception("NPC scripts not importable");

        Directory.CreateDirectory(PrefabsFolder);
        var contents = PrefabUtility.LoadPrefabContents(wrapperPath);
        try
        {
            contents.name = "NPC";
            // The VRM model child is toggled by NpcController.js for visibility ("Model").
            if (contents.transform.childCount > 0) contents.transform.GetChild(0).name = "Model";
            AddFaceExpressionAnimator(contents);
            var combiner = contents.GetComponent<LuidaScriptCombiner>();
            combiner.ClearScripts();
            combiner.AppendScript(boneMapAsset, null);
            combiner.AppendScript(controllerAsset, null, true);

            var item = contents.GetComponent<Item>();
            SetItemName(item, "NPC");
            AddSignalRelay(contents, item, "npc_done");

            PrefabUtility.SaveAsPrefabAsset(contents, NpcPrefabPath);
        }
        finally
        {
            PrefabUtility.UnloadPrefabContents(contents);
        }
        AssetDatabase.DeleteAsset(wrapperPath);

        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(NpcPrefabPath);
        var npc = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        npc.name = "NPC";
        npc.transform.position = l.P(0f, 0f, 1.4f);   // re-placed at runtime; hidden until the greeting period
        npc.transform.rotation = Quaternion.LookRotation(-l.fwd, Vector3.up);
        AddItemGroupMember(npc);
        if (collectorItem != null) AddWorldItemReference(npc, "luida-data-collector", collectorItem);
        return npc;
    }

    // Facial expressions: an Animator on the face mesh GameObject ("Face") with
    //   Bool "joy"         -> Joy state (Fcl_EYE_Joy = 100, Fcl_MTH_Joy = 50), held while true;
    //   Trigger "surprised" -> Surprised state (Fcl_EYE_Surprised = 50, Fcl_MTH_Surprised = 50) for 1 s,
    //                          then back to Joy or Neutral depending on "joy".
    // Cluster Script cannot write blend-shape weights, so NpcController.js drives the Animator through two CCK
    // Set Animator Value gimmicks on the same GameObject, keyed on the NPC item's state ("npc_joy" Bool,
    // "npc_surprised" signal). Gimmicks run natively in the editor preview and in Cluster.
    static void AddFaceExpressionAnimator(GameObject npcRoot)
    {
        AttachFaceExpression(npcRoot, EnsureFaceAssets(true));
    }

    const string NpcJoyKey = "npc_joy", NpcSurprisedKey = "npc_surprised";

    // Finds the face mesh (the SkinnedMeshRenderer with the four blend shapes) under npcRoot, names it "Face" and
    // puts the Animator and the two gimmicks on it. Safe to run again (on the prefab contents or the scene NPC).
    static void AttachFaceExpression(GameObject npcRoot, RuntimeAnimatorController controller)
    {
        var allShapes = JoyShapes.Concat(SurprisedShapes).Select(x => x.shape).ToArray();
        SkinnedMeshRenderer face = null;
        foreach (var smr in npcRoot.GetComponentsInChildren<SkinnedMeshRenderer>(true))
        {
            var mesh = smr.sharedMesh;
            if (mesh == null || mesh.blendShapeCount == 0) continue;
            if (allShapes.All(n => mesh.GetBlendShapeIndex(n) >= 0)) { face = smr; break; }
        }
        if (face == null)
        {
            Debug.LogWarning("[Study4] NPC model has no face mesh with " + string.Join(", ", allShapes) + "; expressions disabled.");
            return;
        }
        if (controller == null) { Debug.LogWarning("[Study4] face animator controller missing; expressions disabled."); return; }
        face.gameObject.name = "Face";

        // Unity returns a "fake null" for missing components, so do not use ?? here.
        var animator = face.gameObject.GetComponent<Animator>();
        if (animator == null) animator = face.gameObject.AddComponent<Animator>();
        animator.runtimeAnimatorController = controller;
        animator.applyRootMotion = false;
        animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;

        var item = npcRoot.GetComponent<Item>();
        foreach (var old in face.gameObject.GetComponents<SetAnimatorValueGimmick>()) Object.DestroyImmediate(old);
        AddAnimatorGimmick(face.gameObject, item, animator, NpcJoyKey, ClusterVR.CreatorKit.ParameterType.Bool, "joy");
        AddAnimatorGimmick(face.gameObject, item, animator, NpcSurprisedKey, ClusterVR.CreatorKit.ParameterType.Signal, "surprised");
        EditorUtility.SetDirty(face.gameObject);
        // The face mesh belongs to a prefab instance in the scene (the NPC, or the model placed under it): record
        // the rename and the component changes as overrides so they survive saving and reloading the scene.
        foreach (Object o in new Object[] { face.gameObject, animator })
            if (PrefabUtility.IsPartOfPrefabInstance(o)) PrefabUtility.RecordPrefabInstancePropertyModifications(o);
        foreach (var g in face.gameObject.GetComponents<SetAnimatorValueGimmick>())
        {
            EditorUtility.SetDirty(g);
            if (PrefabUtility.IsPartOfPrefabInstance(g)) PrefabUtility.RecordPrefabInstancePropertyModifications(g);
        }
        Debug.Log("[Study4] NPC face expressions on '" + face.gameObject.name + "': item state " + NpcJoyKey + " -> joy (" +
                  string.Join(", ", JoyShapes.Select(x => x.shape + "=" + x.weight)) + "), signal " + NpcSurprisedKey + " -> surprised (" +
                  string.Join(", ", SurprisedShapes.Select(x => x.shape + "=" + x.weight)) + ")");
    }

    // CCK Set Animator Value gimmick listening to an item-scoped key (the same wiring LUIDA uses for its GlobalLogics).
    static void AddAnimatorGimmick(GameObject go, Item item, Animator animator, string key, ClusterVR.CreatorKit.ParameterType type, string parameter)
    {
        const BindingFlags F = BindingFlags.NonPublic | BindingFlags.Instance;
        var g = go.AddComponent<SetAnimatorValueGimmick>();
        var ggk = Activator.CreateInstance(typeof(GlobalGimmickKey));
        typeof(GlobalGimmickKey).GetField("key", F)?.SetValue(ggk, new GimmickKey(GimmickTarget.Item, key));
        typeof(GlobalGimmickKey).GetField("item", F)?.SetValue(ggk, item);
        var t = typeof(SetAnimatorValueGimmick);
        t.GetField("globalGimmickKey", F)?.SetValue(g, ggk);
        t.GetField("parameterType", F)?.SetValue(g, type);
        t.GetField("animatorParameterName", F)?.SetValue(g, parameter);
        t.GetField("animator", F)?.SetValue(g, animator);
    }

    // Creates the face clips and the controller; with force they are recreated even if present.
    static RuntimeAnimatorController EnsureFaceAssets(bool force)
    {
        var allShapes = JoyShapes.Concat(SurprisedShapes).Select(x => x.shape).ToArray();
        var existing = AssetDatabase.LoadAssetAtPath<RuntimeAnimatorController>(NpcFaceControllerPath);
        if (existing != null && !force) return existing;

        foreach (var path in new[] { NpcFaceNeutralClipPath, NpcFaceJoyClipPath, NpcFaceSurprisedClipPath, NpcFaceControllerPath, NpcSmileClipPathLegacy })
            if (File.Exists(path)) AssetDatabase.DeleteAsset(path);

        AnimationClip MakeClip(string name, string path, float length, (string shape, float weight)[] on)
        {
            var clip = new AnimationClip { name = name, legacy = false };
            foreach (var shape in allShapes)
            {
                float w = 0f;
                foreach (var o in on) if (o.shape == shape) w = o.weight;
                clip.SetCurve("", typeof(SkinnedMeshRenderer), "blendShape." + shape,
                    AnimationCurve.Constant(0f, length, w));
            }
            AssetDatabase.CreateAsset(clip, path);
            return clip;
        }
        var neutral = MakeClip("NpcFaceNeutral", NpcFaceNeutralClipPath, 0.5f, new (string, float)[0]);
        var joy = MakeClip("NpcFaceJoy", NpcFaceJoyClipPath, 0.5f, JoyShapes);
        var surprised = MakeClip("NpcFaceSurprised", NpcFaceSurprisedClipPath, SurprisedSeconds, SurprisedShapes);
        foreach (var c in new[] { neutral, joy })
        {
            var settings = AnimationUtility.GetAnimationClipSettings(c);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(c, settings);
        }

        var controller = UnityEditor.Animations.AnimatorController.CreateAnimatorControllerAtPath(NpcFaceControllerPath);
        controller.AddParameter("joy", AnimatorControllerParameterType.Bool);
        controller.AddParameter("surprised", AnimatorControllerParameterType.Trigger);
        var sm = controller.layers[0].stateMachine;
        var sNeutral = sm.AddState("Neutral"); sNeutral.motion = neutral;
        var sJoy = sm.AddState("Joy"); sJoy.motion = joy;
        var sSurprised = sm.AddState("Surprised"); sSurprised.motion = surprised;
        sm.defaultState = sNeutral;

        UnityEditor.Animations.AnimatorStateTransition T(UnityEditor.Animations.AnimatorStateTransition tr, float dur, bool exit, float exitTime)
        {
            tr.hasFixedDuration = true; tr.duration = dur; tr.hasExitTime = exit; tr.exitTime = exitTime; tr.offset = 0f;
            return tr;
        }
        T(sNeutral.AddTransition(sJoy), 0.2f, false, 0f).AddCondition(UnityEditor.Animations.AnimatorConditionMode.If, 0f, "joy");
        T(sJoy.AddTransition(sNeutral), 0.25f, false, 0f).AddCondition(UnityEditor.Animations.AnimatorConditionMode.IfNot, 0f, "joy");
        var any = T(sm.AddAnyStateTransition(sSurprised), 0.08f, false, 0f);
        any.canTransitionToSelf = false;
        any.AddCondition(UnityEditor.Animations.AnimatorConditionMode.If, 0f, "surprised");
        T(sSurprised.AddTransition(sJoy), 0.2f, true, 1f).AddCondition(UnityEditor.Animations.AnimatorConditionMode.If, 0f, "joy");
        T(sSurprised.AddTransition(sNeutral), 0.2f, true, 1f).AddCondition(UnityEditor.Animations.AnimatorConditionMode.IfNot, 0f, "joy");
        EditorUtility.SetDirty(controller);
        AssetDatabase.SaveAssets();
        return controller;
    }

    // Append LeftEye/RightEye to the generated BONE_MAP / BONE_PARENT so the NPC can move its eyes.
    static void AppendEyeBonesToBoneMap(string boneMapPath, GameObject vrm)
    {
        var preview = EditorSceneManager.NewPreviewScene();
        GameObject instance = null;
        try
        {
            instance = (GameObject)PrefabUtility.InstantiatePrefab(vrm, preview);
            var animator = instance.GetComponentInChildren<Animator>();
            if (animator == null || animator.avatar == null || !animator.avatar.isHuman) return;
            var left = animator.GetBoneTransform(HumanBodyBones.LeftEye);
            var right = animator.GetBoneTransform(HumanBodyBones.RightEye);
            if (left == null || right == null) { Debug.LogWarning("[Study4] NPC model has no eye bones; gaze will use head only"); return; }

            string js = File.ReadAllText(boneMapPath);
            string Entry(string bone, Transform t) => string.Format(CultureInfo.InvariantCulture,
                "  {{ bone: HumanoidBone.{0}, name: \"{1}\", rest: {2}, restParent: {3} }},\n",
                bone, t.name.Replace("\"", "\\\""), Q(t.rotation), Q(t.parent != null ? t.parent.rotation : Quaternion.identity));

            int mapStart = js.IndexOf("const BONE_MAP = [", StringComparison.Ordinal);
            int mapEnd = js.IndexOf("];", mapStart, StringComparison.Ordinal);
            js = js.Insert(mapEnd, Entry("LeftEye", left) + Entry("RightEye", right));

            int parentStart = js.IndexOf("const BONE_PARENT = {", StringComparison.Ordinal);
            int parentEnd = js.IndexOf("};", parentStart, StringComparison.Ordinal);
            js = js.Insert(parentEnd, "  [HumanoidBone.LeftEye]: HumanoidBone.Head,\n  [HumanoidBone.RightEye]: HumanoidBone.Head,\n");

            File.WriteAllText(boneMapPath, js);
            AssetDatabase.ImportAsset(boneMapPath, ImportAssetOptions.ForceUpdate);
        }
        finally
        {
            if (instance != null) Object.DestroyImmediate(instance);
            EditorSceneManager.ClosePreviewScene(preview);
        }
    }

    static string Q(Quaternion q) => string.Format(CultureInfo.InvariantCulture,
        "new Quaternion({0:G7}, {1:G7}, {2:G7}, {3:G7})", q.x, q.y, q.z, q.w);

    // Item-scope signal <key> on this item -> Global signal <key> (same relay pattern LUIDA uses).
    static void AddSignalRelay(GameObject go, Item item, string key)
    {
        AddGlobalWrite(go, item, key, key, 0, null);
    }

    // Item-scope signal <triggerKey> on this item -> writes the Global state <targetKey>.
    // paramType: 0 = Signal, 1 = Bool, 3 = Integer (CCK ParameterType); value is the constant for Bool / Integer.
    static void AddGlobalWrite(GameObject go, Item item, string triggerKey, string targetKey, int paramType, object value)
    {
        var templatePrefab = Resources.Load<GameObject>(ResetLogicResourcePath);
        if (templatePrefab == null) throw new Exception("ResetGlobalBool template missing");
        var template = templatePrefab.GetComponent<GlobalLogic>();
        var relay = go.AddComponent<GlobalLogic>();
        EditorUtility.CopySerialized(template, relay);

        var gimmickKey = Activator.CreateInstance(typeof(GlobalGimmickKey));
        typeof(GlobalGimmickKey).GetField("key", BindingFlags.NonPublic | BindingFlags.Instance)
            ?.SetValue(gimmickKey, new GimmickKey(GimmickTarget.Item, triggerKey));
        typeof(GlobalGimmickKey).GetField("item", BindingFlags.NonPublic | BindingFlags.Instance)
            ?.SetValue(gimmickKey, item);
        typeof(GlobalLogic).GetField("globalGimmickKey", BindingFlags.NonPublic | BindingFlags.Instance)
            ?.SetValue(relay, gimmickKey);
        if (paramType == 0) LuidaFakeGimmick.PatchStatementAtSignal(relay, 0, targetKey);
        else LuidaFakeGimmick.PatchStatementAt(relay, 0, targetKey, paramType, value);
        EditorUtility.SetDirty(relay);
    }

    static void AddItemGroupMember(GameObject go)
    {
        var member = go.GetComponent<ItemGroupMember>();
        if (member == null) member = go.AddComponent<ItemGroupMember>();
        ItemGroupHost host = null;
        foreach (var root in SceneManager.GetActiveScene().GetRootGameObjects())
        {
            if (PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(root) != ExpManagersPrefabPath) continue;
            for (int i = 0; i < root.transform.childCount; i++)
            {
                var child = root.transform.GetChild(i).gameObject;
                if (PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(child) == ConditionManagerPrefabPath)
                    host = child.GetComponent<ItemGroupHost>();
            }
        }
        if (host == null) { Debug.LogWarning("[Study4] ConditionManager ItemGroupHost not found"); return; }
        var so = new SerializedObject(member);
        so.FindProperty("host").objectReferenceValue = host;
        so.ApplyModifiedPropertiesWithoutUndo();
    }

    static void AddWorldItemReference(GameObject go, string id, Item target)
    {
        var list = go.GetComponent<WorldItemReferenceList>();
        if (list == null) list = go.AddComponent<WorldItemReferenceList>();
        var so = new SerializedObject(list);
        var prop = so.FindProperty("worldItemReferences");
        for (int i = 0; i < prop.arraySize; i++)
        {
            var e = prop.GetArrayElementAtIndex(i);
            if (e.FindPropertyRelative("id").stringValue == id)
            {
                e.FindPropertyRelative("item").objectReferenceValue = target;
                so.ApplyModifiedPropertiesWithoutUndo();
                return;
            }
        }
        prop.InsertArrayElementAtIndex(prop.arraySize);
        var el = prop.GetArrayElementAtIndex(prop.arraySize - 1);
        el.FindPropertyRelative("id").stringValue = id;
        el.FindPropertyRelative("item").objectReferenceValue = target;
        so.ApplyModifiedPropertiesWithoutUndo();
    }

    static void SetItemName(Item item, string name)
    {
        if (item == null) return;
        var so = new SerializedObject(item);
        var p = so.FindProperty("itemName");
        if (p != null) { p.stringValue = name; so.ApplyModifiedPropertiesWithoutUndo(); }
    }

    // ------------------------------------------------------------------ 5. state-listening items
    static void BuildStateListeningItems(Layout l, Materials m, GameObject npc, Item collectorItem)
    {
        var tab = ScriptableObject.CreateInstance<ItemsManagerConfigTab>();
        try
        {
            tab.OnEnable();

            // -- Instruction board ------------------------------------------------
            var instruction = CreateSli(tab, "Instruction");
            instruction.transform.position = l.P(0f, 1.95f, 2.3f);
            instruction.transform.rotation = l.FaceAwayFromViewer(instruction.transform.position);
            AddText(instruction, "Text", Vector3.zero, 0.07f, 1.0f);
            WriteItemData(instruction, InstructionListeners(), null, InstructionLegacy(l));

            // -- NpcDirector --------------------------------------------------------
            var director = CreateSli(tab, "NpcDirector");
            director.transform.position = l.P(0f, 0f, 1.0f);
            AddWorldItemReference(director, "NPC", npc.GetComponent<Item>());
            WriteItemData(director, NpcDirectorListeners(l), NpcDirectorHandlers(), NpcDirectorLegacy);

            // -- AvatarGate (left side) ---------------------------------------------
            var gateGroup = new GameObject("AvatarGateUI");
            gateGroup.transform.position = l.P(-0.8f, 1.3f, 0.9f);
            gateGroup.transform.rotation = l.FaceAwayFromViewer(gateGroup.transform.position);
            var avatarGate = CreateSli(tab, "AvatarGate");
            avatarGate.transform.SetParent(gateGroup.transform, false);
            AddText(avatarGate, "Text", new Vector3(0f, 0.32f, 0f), 0.045f, 1.0f);
            var agBtns = new (string id, string label, Vector3 pos, Vector3 size, int value)[]
            {
                ("AG_Changed", "着替えました", new Vector3(0f, 0.05f, 0f), new Vector3(0.34f, 0.09f, 0.05f), 1),
                ("AG_Yes", "はい", new Vector3(-0.2f, -0.12f, 0f), new Vector3(0.24f, 0.09f, 0.05f), 2),
                ("AG_No", "いいえ", new Vector3(0.2f, -0.12f, 0f), new Vector3(0.24f, 0.09f, 0.05f), 3),
            };
            foreach (var b in agBtns)
            {
                var btn = CreateButton(gateGroup.transform, b.id, b.label, b.pos, b.size, avatarGate.GetComponent<Item>(), "gate_btn", b.value, m);
                AddWorldItemReference(avatarGate, b.id, btn.GetComponent<Item>());
            }
            WriteItemData(avatarGate, AvatarGateListeners(), null, AvatarGateLegacy);

            // -- DeviceCheck ----------------------------------------------------------
            var dcGroup = new GameObject("DeviceCheckUI");
            dcGroup.transform.position = l.P(0.8f, 1.1f, 0.9f);
            dcGroup.transform.rotation = l.FaceAwayFromViewer(dcGroup.transform.position);
            var deviceCheck = CreateSli(tab, "DeviceCheck");
            deviceCheck.transform.SetParent(dcGroup.transform, false);
            AddText(deviceCheck, "Text", new Vector3(0f, 0.25f, 0f), 0.04f, 1.0f);
            var dcBtn = CreateButton(dcGroup.transform, "DC_Force", DcForceLabel, new Vector3(0f, -0.05f, 0f), new Vector3(0.55f, 0.09f, 0.05f),
                deviceCheck.GetComponent<Item>(), "dc_btn", 1, m, 0.028f);
            AddWorldItemReference(deviceCheck, "DC_Force", dcBtn.GetComponent<Item>());
            WriteItemData(deviceCheck, DeviceCheckListeners(), null, DeviceCheckLegacy);

            // -- ReportPanel (right side) -------------------------------------------
            var rpGroup = new GameObject("ReportPanelUI");
            rpGroup.transform.position = l.P(0.85f, 1.35f, 0.9f);
            rpGroup.transform.rotation = l.FaceAwayFromViewer(rpGroup.transform.position);
            var reportPanel = CreateSli(tab, "ReportPanel");
            reportPanel.transform.SetParent(rpGroup.transform, false);
            AddText(reportPanel, "Text", new Vector3(0f, 0.36f, 0f), 0.04f, 1.0f);
            for (int i = 0; i <= 10; i++)
            {
                int row = i <= 5 ? 0 : 1;
                float x = row == 0 ? (i - 2.5f) * 0.14f : (i - 6 - 2f) * 0.14f;
                float y = row == 0 ? 0.14f : -0.02f;
                var btn = CreateButton(rpGroup.transform, "RP_" + i, i.ToString(), new Vector3(x, y, 0f), new Vector3(0.12f, 0.10f, 0.05f),
                    reportPanel.GetComponent<Item>(), "rp_btn", i + 1, m, 0.03f);
                AddWorldItemReference(reportPanel, "RP_" + i, btn.GetComponent<Item>());
            }
            var done = CreateButton(rpGroup.transform, "RP_Done", "決定", new Vector3(0f, -0.2f, 0f), new Vector3(0.3f, 0.09f, 0.05f),
                reportPanel.GetComponent<Item>(), "rp_btn", 12, m);
            AddWorldItemReference(reportPanel, "RP_Done", done.GetComponent<Item>());
            WriteItemData(reportPanel, ReportPanelListeners(), ReportPanelHandlers(), ReportPanelLegacy);

            // -- MirrorPanel (CCK mirror diagonally behind the NPC, visible during trials) --
            var mirrorPanel = CreateSli(tab, "MirrorPanel");
            mirrorPanel.transform.position = l.P(-1.1f, 1.15f, 2.2f);
            mirrorPanel.transform.rotation = l.FaceAwayFromViewer(mirrorPanel.transform.position);
            var mirrorPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(MirrorPrefabPath);
            if (mirrorPrefab != null)
            {
                var mirror = (GameObject)PrefabUtility.InstantiatePrefab(mirrorPrefab, mirrorPanel.transform);
                mirror.name = "Mirror";
                mirror.transform.localPosition = Vector3.zero;
                mirror.transform.localRotation = Quaternion.identity;
                mirror.transform.localScale = new Vector3(1.3f, 2.0f, 1f);
                mirror.SetActive(false);
            }
            else Debug.LogWarning("[Study4] CCK Mirror prefab not found at " + MirrorPrefabPath);
            WriteItemData(mirrorPanel, MirrorPanelListeners(), null, "");

            // -- ExitPortal (gate back to the recruitment world, shown at End) -------
            var exitPortal = CreateSli(tab, "ExitPortal");
            exitPortal.transform.position = l.P(2.5f, 0f, 0.5f);
            exitPortal.transform.rotation = Quaternion.LookRotation(-l.right, Vector3.up);
            var gate = FindRootGateInstance();
            if (gate != null)
            {
                gate.transform.SetParent(exitPortal.transform, false);
                gate.transform.localPosition = ExitGateOffset;
                gate.transform.localRotation = Quaternion.identity;
                gate.name = "WorldGateToLuidaBar";
                gate.SetActive(false);
            }
            else Debug.LogWarning("[Study4] WorldGateToLuidaBar instance not found in the template scene");
            WriteItemData(exitPortal, ExitPortalListeners(), null, ExitPortalLegacy());

            // -- final placement, sizes and backings of all UI (also used by "Update layout ...") --
            ApplyLayout(l, m);

            // -- generate JS for all items -------------------------------------------
            ItemsManagerAssetUtil.RefreshStateListeningItems(tab);
            ItemsManagerAssetUtil.ApplyAssetsToScripts(tab);
        }
        finally
        {
            tab.OnDisable();
            Object.DestroyImmediate(tab);
        }
    }

    static GameObject CreateSli(ItemsManagerConfigTab tab, string name)
    {
        ItemsManagerAssetUtil.RefreshStateListeningItems(tab);
        tab.newItemName = name;
        ItemsManagerAssetUtil.CreateStateListeningItem(tab);
        ItemsManagerAssetUtil.RefreshStateListeningItems(tab);
        var go = tab.stateListeningItems.FirstOrDefault(g => g != null && g.name == name);
        if (go == null) throw new Exception("Failed to create state-listening item " + name);
        SetItemName(go.GetComponent<Item>(), name);
        return go;
    }

    static GameObject FindRootGateInstance()
    {
        foreach (var root in SceneManager.GetActiveScene().GetRootGameObjects())
        {
            if (PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(root) == GatePrefabPath) return root;
        }
        return null;
    }

    static void AddText(GameObject parent, string name, Vector3 localPos, float size, float maxWidth)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent.transform, false);
        go.transform.localPosition = localPos;
        var tv = go.AddComponent<TextView>();
        var so = new SerializedObject(tv);
        so.FindProperty("text").stringValue = "";
        so.FindProperty("size").floatValue = size;
        so.FindProperty("textAnchor").enumValueIndex = (int)TextAnchor.MiddleCenter;
        so.FindProperty("textAlignment").enumValueIndex = (int)TextAlignment.Center;
        so.FindProperty("color").colorValue = Color.white;
        so.ApplyModifiedPropertiesWithoutUndo();
    }

    static GameObject CreateButton(Transform parent, string id, string label, Vector3 localPos, Vector3 size,
        Item owner, string key, int value, Materials m, float labelSize = 0.035f)
    {
        var go = new GameObject(id);
        go.transform.SetParent(parent, false);
        go.transform.localPosition = localPos;

        var item = go.AddComponent<Item>();
        SetItemName(item, id);
        var scriptable = go.AddComponent<ScriptableItem>();
        var buttonJs = AssetDatabase.LoadAssetAtPath<JavaScriptAsset>(ButtonJsPath);
        if (buttonJs == null) throw new Exception("Study4Button.js not importable: " + ButtonJsPath);
        var sso = new SerializedObject(scriptable);
        sso.FindProperty("sourceCodeAsset").objectReferenceValue = buttonJs;
        sso.ApplyModifiedPropertiesWithoutUndo();

        var trigger = go.AddComponent<InteractItemTrigger>();
        var tso = new SerializedObject(trigger);
        tso.FindProperty("item").objectReferenceValue = item;
        var triggers = tso.FindProperty("triggers");
        triggers.ClearArray();
        triggers.InsertArrayElementAtIndex(0);
        var t = triggers.GetArrayElementAtIndex(0);
        t.FindPropertyRelative("target").enumValueIndex = (int)ClusterVR.CreatorKit.Trigger.TriggerTarget.SpecifiedItem;
        t.FindPropertyRelative("specifiedTargetItem").objectReferenceValue = owner;
        t.FindPropertyRelative("key").stringValue = key;
        t.FindPropertyRelative("type").enumValueIndex = (int)ClusterVR.CreatorKit.ParameterType.Integer;
        t.FindPropertyRelative("value").FindPropertyRelative("integerValue").intValue = value;
        tso.ApplyModifiedPropertiesWithoutUndo();

        // visuals: Visual (default), VisualOn (highlighted, hidden by default), Label
        var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
        visual.name = "Visual";
        visual.transform.SetParent(go.transform, false);
        visual.transform.localScale = size;
        visual.GetComponent<MeshRenderer>().sharedMaterial = m.btn;

        var visualOn = GameObject.CreatePrimitive(PrimitiveType.Cube);
        visualOn.name = "VisualOn";
        visualOn.transform.SetParent(go.transform, false);
        visualOn.transform.localScale = size * 1.06f;
        visualOn.GetComponent<MeshRenderer>().sharedMaterial = m.btnOn;
        visualOn.SetActive(false);

        var labelGo = new GameObject("Label");
        labelGo.transform.SetParent(go.transform, false);
        labelGo.transform.localPosition = new Vector3(0f, 0f, -size.z * 0.5f - 0.005f);
        var tv = labelGo.AddComponent<TextView>();
        var lso = new SerializedObject(tv);
        lso.FindProperty("text").stringValue = label;
        lso.FindProperty("size").floatValue = labelSize;
        lso.FindProperty("textAnchor").enumValueIndex = (int)TextAnchor.MiddleCenter;
        lso.FindProperty("textAlignment").enumValueIndex = (int)TextAlignment.Center;
        lso.FindProperty("color").colorValue = Color.white;
        lso.ApplyModifiedPropertiesWithoutUndo();

        // Buttons start hidden; the owner item shows them when needed (Study4Button.js keeps them hidden until told).
        visual.SetActive(false);
        labelGo.SetActive(false);
        return go;
    }

    static void WriteItemData(GameObject item, List<StateListener> listeners, List<EventHandlerData> handlers, string legacy)
    {
        var path = ItemsManagerAssetUtil.GetItemDataAssetPath(item);
        var data = AssetDatabase.LoadAssetAtPath<StateListeningItemData>(path);
        if (data == null) throw new Exception("StateListeningItemData missing for " + item.name + " at " + path);
        data.stateListeners = listeners.ToArray();
        data.eventHandlers = handlers ?? new List<EventHandlerData>();
        data.otherImplementation = legacy ?? "";
        EditorUtility.SetDirty(data);
        AssetDatabase.SaveAssets();
    }

    // ------------------------------------------------------------------ action helpers
    static StateListeningAction T_ShowItem => new StateListeningAction("Show item", "$.setStateCompat('this', 'exp_showItem', true);", _category: "Item");
    static StateListeningAction T_SetText => new StateListeningAction("Set text", "$.subNode('Text').setText(`{_text_}`);", new[] { "text" }, _category: "Item");
    static StateListeningAction T_ToNext => new StateListeningAction("To next state", "$.sendSignalCompat('this', 'state_triggerTransition');", _category: "State machine");
    static StateListeningAction T_Sleep => new StateListeningAction("Sleep", "{_seconds_}", new[] { "seconds" }, _category: "State machine");
    static StateListeningAction T_Upload => new StateListeningAction("Upload collected data", "$.sendSignalCompat('this', 'exp_uploadCustomData');", _displayLabel: "Upload saved data from collector", _category: "Data collection");
    static StateListeningAction T_ShowChild => new StateListeningAction("Show child", "$.subNode('{_childName_}').setEnabled(true)", new[] { "childName" }, _category: "Item child");
    static StateListeningAction T_HideChild => new StateListeningAction("Hide child", "$.subNode('{_childName_}').setEnabled(false)", new[] { "childName" }, _category: "Item child");
    static StateListeningAction T_SetParticipantPos => new StateListeningAction("Set participant position",
        "PARTICIPANTS[{_participantIndex_}].setPosition(new Vector3({_x_}, {_y_}, {_z_}));", new[] { "participantIndex", "x", "y", "z" }, _category: "Participant transform");
    static StateListeningAction T_SetParticipantRot => new StateListeningAction("Set participant rotation",
        "PARTICIPANTS[{_participantIndex_}].setRotation(new Quaternion().setFromEulerAngles(new Vector3({_x_}, {_y_}, {_z_})));", new[] { "participantIndex", "x", "y", "z" }, _category: "Participant transform");
    static StateListeningAction T_Custom => new StateListeningAction("Customized Action", "", null);

    static StateListenerAction Act(StateListeningAction template, params (string key, string value)[] vars)
    {
        var a = new StateListenerAction(template);
        foreach (var (key, value) in vars) a.variableValues[key] = value;
        return a;
    }
    static StateListenerAction Custom(string code) => new StateListenerAction(T_Custom) { customAction = code };
    static StateListenerAction If(StateListenerAction a, string variable, string value)
    {
        a.isConditional = true; a.conditionVariable = variable; a.conditionValue = value; return a;
    }
    static StateListenerAction SetText(string text) => Act(T_SetText, ("text", text));
    static StateListenerAction Sleep(float seconds) => Act(T_Sleep, ("seconds", seconds.ToString(CultureInfo.InvariantCulture)));
    static string F(float v) => v.ToString("0.###", CultureInfo.InvariantCulture);

    static StateListener Listener(int stateId, List<StateListenerAction> start = null, List<StateListenerAction> during = null, List<StateListenerAction> exit = null)
    {
        return new StateListener
        {
            stateID = stateId,
            onStateStartedActions = start ?? new List<StateListenerAction>(),
            duringStateActions = during ?? new List<StateListenerAction>(),
            onStateExitedActions = exit ?? new List<StateListenerAction>(),
        };
    }
    static List<StateListenerAction> L(params StateListenerAction[] a) => a.ToList();

    // ------------------------------------------------------------------ Instruction
    // ins_show(slot, text, size?): 'front' = above the NPC's head, 'above' = just above the questionnaire form
    // (questionnaire states), 'center' = straight ahead (debrief, end). Lines are kept to about 15 glyphs
    // (22 in the debrief, which uses a smaller size).
    static List<StateListener> InstructionListeners()
    {
        return new List<StateListener>
        {
            // Start: what the participant will do (no conditions or hypotheses), straight ahead, with an "OK"
            // button below it (the state has no questionnaire; an exit time set on the state also moves on)
            Listener(S_START,
                L(Act(T_ShowItem), Custom("ins_okBegin();"), Ins("center",
                    "ようこそ。\\n" +
                    "この実験では、正面に現れる相手に挨拶をしたあと、\\n" +
                    "相手の手があなたの顔にゆっくり近づく様子を\\n" +
                    "見ていただきます。そのたびに、感じたことを\\n" +
                    "短い質問にお答えください。\\n" +
                    "途中で、アバターの着替えと機器の確認をお願いします。\\n" +
                    "読み終わったら、下の「OK」を押してください。")),
                L(Custom("if (ins_okPressed()) { ins_okButton(false); ToNextState(); }")),
                L(Custom("ins_okButton(false);"))),
            Listener(S_TSTART, L(Custom("ins_show('front', 'ブロック ' + CONDITION['block'] + ' / 2');"))),
            // pose (tracking) check after the avatar switch, before the NPC appears: 1st trial of each block only
            Listener(S_POSE, L(Custom("if (CONDITION['rep'] === '1') ins_show('front', '鏡を見ながら、次の動きをしてください。\\n1) 頭をゆっくり左右に向ける\\n2) 両手を頭より高く上げる');"))),
            Listener(S_GREET, L(Custom("if (CONDITION['rep'] === '1') ins_show('front', '30秒間、目の前のアバターを見ながら\\n挨拶してください。\\n（例：手を振る、少し横に動く）');"))),
            Listener(S_TOUCH, L(Ins("front", "正面の相手の手がゆっくり近づきます。\\n顔を正面に向けたまま、\\n楽な姿勢で見ていてください。"))),
            Listener(S_REPORT, L(Ins("front", "下のパネルで質問に答えてください。"))),
            Listener(S_VEQ, L(Custom("if (CONDITION['rep'] === '2') ins_show('above', 'あなたがいま使っているアバター（問題文では\\n「仮想身体」と表現されていることがあります）\\nについて伺います。');"))),
            Listener(S_TREST, L(Ins("front", "少し休憩します…"))),
            Listener(S_SOCIAL, L(Ins("above", "あなたの顔に触れてきた相手についてのアンケートです。"))),
            Listener(S_PERSONAL, L(Ins("above", "最後のアンケートです。"))),
            // Debrief: thanks, what was studied and under which conditions, a request not to talk about it this
            // month, then the "OK" button -> End
            Listener(S_DEBRIEF,
                L(Custom("ins_okBegin();"), Ins("center",
                    "ご参加いただき、ありがとうございました。\\n" +
                    "この実験では、「ファントムセンス（VR感覚・V感）」のうち、\\n" +
                    "誰かに触れられたと感じる「ファントムタッチ錯覚」が、\\n" +
                    "相手の反応や自分のアバターに影響されるかを調べていました。\\n" +
                    "ファントムタッチ錯覚とは、VR で相手のアバターの手が顔に\\n" +
                    "近づいたり触れたりしたときに、実際には触れられていないのに、\\n" +
                    "顔に感覚が生じる現象です。\\n" +
                    "具体的には、相手が目を合わせたり手を振ったりするかどうかと、\\n" +
                    "普段使いのアバターかどうかで、\\n" +
                    "感じ方がどう変わるかを比べました。\\n" +
                    "【お願い】 今月中は、この実験の内容や条件について、\\n" +
                    "ほかの方に話さないようお願いします。\\n" +
                    "読み終わったら、下の「OK」を押してください。", InsDebriefSize)),
                L(Custom("if (ins_okPressed()) { ins_okButton(false); ToNextState(); }")),
                L(Custom("ins_okButton(false);"))),
            // End: countdown; the ExitPortal teleports the participant into the exit gate when it reaches 0
            Listener(S_END,
                L(Custom("ins_endBegin();")),
                L(Custom("ins_endTick();"))),
        };
    }
    static StateListenerAction Ins(string slot, string text) => Custom("ins_show('" + slot + "', '" + text + "');");
    static StateListenerAction Ins(string slot, string text, float size) => Custom("ins_show('" + slot + "', '" + text + "', " + F4(size) + ");");

    static string F4(float v) => v.ToString("0.####", CultureInfo.InvariantCulture);

    // The Instruction item sits at the standing spot (ApplyLayout); slot poses are in its local frame.
    static string InstructionLegacy(Layout l)
    {
        var inv = Quaternion.Inverse(l.Frame);
        string Slot(Vector3 wp, float size)
        {
            var lp = inv * (wp - l.origin);
            var lr = inv * l.FaceEye(wp);
            return "{ p: new Vector3(" + F4(lp.x) + ", " + F4(lp.y) + ", " + F4(lp.z) + "), r: new Quaternion(" +
                   F4(lr.x) + ", " + F4(lr.y) + ", " + F4(lr.z) + ", " + F4(lr.w) + "), size: " + F4(size) + " }";
        }
        return "// ---- Study 4: Instruction board (placements; backing quad scaled to the text) ----\n" +
               "// slots: front = above the NPC's head, above = just above the questionnaire form, center = straight ahead\n" +
               "const INS_SLOTS = {\n  front: " + Slot(InsFrontPos(l), InsSize) + ",\n  above: " + Slot(InsAbovePos(l), InsAboveSize) +
               ",\n  center: " + Slot(InsCenterPos(l), InsSize) + ",\n};\n" +
               "// CCK TextView metrics (Noto Sans CJK): full-width glyph ~1.85 x size wide, ASCII ~0.56 of that, line ~2.74 x size\n" +
               "const INS_GLYPH_W = " + F4(GlyphW) + ", INS_LINE_H = " + F4(LineH) + ", INS_PAD = " + F4(InsBoardPad) + ";\n" +
               "function ins_show(slot, text, size) {\n" +
               "  const s = INS_SLOTS[slot] || INS_SLOTS.front;\n" +
               "  const sz = size || s.size;\n" +
               "  const t = $.subNode('Text');\n" +
               "  if (t) {\n" +
               "    t.setPosition(s.p); t.setRotation(s.r);\n" +
               "    try { t.setTextSize(sz); } catch (e) { $.log('[Instruction] setTextSize: ' + e); }\n" +
               "  }\n" +
               "  SetText(text);\n" +
               "  const lines = text ? String(text).split('\\n') : [];\n" +
               "  let w = 0;\n" +
               "  for (const ln of lines) { let lw = 0; for (let i = 0; i < ln.length; i++) lw += ln.charCodeAt(i) < 0x80 ? 0.56 : 1; if (lw > w) w = lw; }\n" +
               "  const bg = $.subNode('Bg');\n" +
               "  if (!bg) return;\n" +
               "  if (lines.length === 0 || w === 0) { bg.setEnabled(false); return; }\n" +
               "  try {\n" +
               "    bg.getUnityComponent('Transform').unityProp.localScale = new Vector3(w * INS_GLYPH_W * sz + INS_PAD * 2, lines.length * INS_LINE_H * sz + INS_PAD, 1);\n" +
               "    bg.setEnabled(true);\n" +
               "  } catch (e) { $.log('[Instruction] backing: ' + e); }\n" +
               "}\n" +
               "// Debrief 'OK' button (item DB_Ok; its Interact Item Trigger writes the Integer state 'ins_btn' here)\n" +
               "function ins_okButton(visible) {\n" +
               "  try { const h = $.worldItemReference('DB_Ok'); if (h) h.send('btn_cfg', { visible: visible, label: 'OK' }); }\n" +
               "  catch (e) { $.log('[Instruction] send DB_Ok: ' + e); }\n" +
               "}\n" +
               "function ins_okBegin() { $.setStateCompat('this', 'ins_btn', 0); ins_okButton(true); }\n" +
               "function ins_okPressed() {\n" +
               "  const b = $.getStateCompat('this', 'ins_btn', 'integer');\n" +
               "  if (!(b > 0)) return false;\n" +
               "  $.setStateCompat('this', 'ins_btn', 0);\n" +
               "  return true;\n" +
               "}\n" +
               "// End: countdown to the exit gate (ExitPortal uses the same delay). After the participant has left, the next\n" +
               "// person who joins the same space sees a waiting text; the LUIDA ParticipantManager asks them, in front of\n" +
               "// them, whether they are a new participant and brings the world back to Start when they confirm.\n" +
               "const INS_END_SEC = " + EndGateDelaySec + ";\n" +
               "function ins_endBegin() { $.state.ins_endTs = Date.now(); $.state.ins_endText = null; ins_endTick(); }\n" +
               "function ins_endText() {\n" +
               "  const p = PARTICIPANTS[1];\n" +
               "  if (!p || !p.exists()) return 'しばらくお待ちください…';\n" +
               "  const left = Math.max(0, Math.ceil(INS_END_SEC - (Date.now() - ($.state.ins_endTs || Date.now())) / 1000));\n" +
               "  return left > 0\n" +
               "    ? 'ご参加ありがとうございました。\\nあと ' + left + ' 秒で募集ワールドへ移動します。'\n" +
               "    : 'ご参加ありがとうございました。\\n募集ワールドへ移動します。';\n" +
               "}\n" +
               "function ins_endTick() {\n" +
               "  const text = ins_endText();\n" +
               "  if (text === $.state.ins_endText) return;\n" +
               "  $.state.ins_endText = text;\n" +
               "  ins_show('center', text);\n" +
               "}\n";
    }

    // ------------------------------------------------------------------ NpcDirector
    static List<StateListener> NpcDirectorListeners(Layout l)
    {
        var yaw = Quaternion.LookRotation(l.fwd, Vector3.up).eulerAngles.y;
        // the NPC stands along the marker's facing direction (not wherever the participant happens to look)
        string fwd = "new Vector3(" + F(l.fwd.x) + ", 0, " + F(l.fwd.z) + ")";
        string origin = "new Vector3(" + F(l.origin.x) + ", " + F(l.origin.y) + ", " + F(l.origin.z) + ")";
        StateListenerAction ResetPos() => Act(T_SetParticipantPos, ("participantIndex", "1"), ("x", F(l.origin.x)), ("y", F(l.origin.y)), ("z", F(l.origin.z)));
        StateListenerAction ResetRot() => Act(T_SetParticipantRot, ("participantIndex", "1"), ("x", "0"), ("y", F(yaw)), ("z", "0"));
        return new List<StateListener>
        {
            // Locomotion is frozen from entry (nd_tick keeps the rate at 0) except in the greeting period. The NPC is
            // hidden here too (and the height platform lowered): after a session reset from the middle of a trial it
            // would otherwise stand there until Trial - Start.
            Listener(S_START, L(Act(T_ShowItem), Custom("nd_setMove(0);\n$.worldItemReference('NPC').send('npc_hide', {});"))),
            // Setup first: it also lowers the previous block's height platform (the participant's avatar, and so
            // their height, changes in this state); then the participant is put on the marker at floor level.
            Listener(S_TSTART, L(
                If(Custom("$.worldItemReference('NPC').send('npc_setup', { social: CONDITION['social'] === 'with', fwd: " + fwd + ", origin: " + origin + ", floorY: " + F(l.origin.y) + ", eyes: nd_useEyeBones() });"), "rep", "1"),
                Sleep(0.5f),
                If(ResetPos(), "rep", "1"),
                If(ResetRot(), "rep", "1"),
                If(Custom("$.worldItemReference('NPC').send('npc_hide', {});"), "rep", "1")
            )),
            // Greeting period: the NPC appears after the avatar switch (rep == 1) and, in the social-cue
            // condition, reacts to the participant for GreetingSeconds. The participant may walk around here
            // (and only here). Skipped for the 2nd trial of a block.
            Listener(S_GREET,
                L(Custom(
                    "if (CONDITION['rep'] === '1') {\n" +
                    "  nd_setMove(1);\n" +
                    "  $.worldItemReference('NPC').send('npc_show', { social: CONDITION['social'] === 'with' });\n" +
                    "  $.worldItemReference('NPC').send('npc_greeting_begin', { social: CONDITION['social'] === 'with' });\n" +
                    "} else {\n" +
                    "  ToNextState();\n" +
                    "}")),
                null,
                L(Custom("nd_setMove(0);\n$.worldItemReference('NPC').send('npc_greeting_end', {});"))),
            // Touch and stroke: freeze; the NPC puts the participant back on the marker (position and facing, on
            // their height platform), waits a moment, then turns to them, steps in and touches. At the end the
            // NPC steps back to the conversation spot and disappears before npc_done.
            Listener(S_TOUCH,
                L(Custom(
                    "nd_setMove(0);\n" +
                    "nd_arm();\n" +
                    "$.state.nd_touchStartTs = Date.now();\n" +
                    "SendDataToCollector('trialStartTs', $.state.nd_touchStartTs);\n" +
                    "SendDataToCollector('npcTimeout', false);\n" +
                    "$.worldItemReference('NPC').send('npc_trial_start', {\n" +
                    "  block: CONDITION['block'], rep: CONDITION['rep'], fwd: " + fwd + ", reset: true,\n" +
                    "  avatar: nd_avatarForBlock(CONDITION['block']), social: CONDITION['social'] === 'with' });")),
                L(Custom(
                    "if (nd_donePulse()) { ToNextState(); }\n" +
                    "else if ($.state.nd_touchStartTs && Date.now() - $.state.nd_touchStartTs > 120000) {\n" +
                    "  $.log('[NpcDirector] NPC did not finish within 120 s; moving on');\n" +
                    "  SendDataToCollector('npcTimeout', true);\n" +
                    "  $.worldItemReference('NPC').send('npc_abort', {});\n" +
                    "  $.state.nd_touchStartTs = 0;\n" +
                    "  ToNextState();\n" +
                    "}"))),
            // VEQ is answered once per block (after the 2nd trial); the 1st trial's visit is skipped immediately.
            // (The NPC has already hidden itself at the end of the touch phase.)
            Listener(S_VEQ, L(Custom("if (CONDITION['rep'] !== '2') ToNextState();"))),
            // End: the participant is teleported into the exit gate (ExitPortal), so locomotion stays frozen.
            Listener(S_END, L(Act(T_Upload))),
        };
    }

    static List<EventHandlerData> NpcDirectorHandlers()
    {
        var update = new EventHandlerData("Update");
        update.actions.Add(Custom("nd_tick(deltaTime);"));
        return new List<EventHandlerData> { update };
    }

    const string NpcDirectorLegacy = @"// ---- Study 4: NpcDirector helpers (shared by the actions above) ----
function nd_avatarForBlock(block) {
  const dailyFirst = CONDITION && CONDITION['order'] === 'daily_first';
  return (dailyFirst === (String(block) === '1')) ? 'daily' : 'assigned';
}
function nd_signalTime(key) {
  const d = $.getStateCompat('global', key, 'signal');
  if (!d) return 0;
  return (typeof d.getTime === 'function') ? d.getTime() : (Number(d) || 0);
}
// Remember the current timestamp of the global signal so only a NEW pulse counts.
function nd_arm() { $.state.nd_lastDone = nd_signalTime('npc_done'); }
function nd_donePulse() {
  const t = nd_signalTime('npc_done');
  if (t !== ($.state.nd_lastDone || 0)) { $.state.nd_lastDone = t; return t !== 0; }
  return false;
}
// The NPC aims under the participant's eye bones only in a real deployment: the editor emulator (CSEmulator)
// throws for avatars without eye bones instead of returning null, which would abort the NPC's handlers.
// isTestMode comes from LUIDA's ExpIdentifiers.js (flipped to false by the pre-upload step); unknown -> off.
function nd_useEyeBones() { return (typeof isTestMode !== 'undefined') ? !isTestMode : false; }
// Participant locomotion (stick / keyboard move speed): 0 unless set otherwise; walking in the room is
// not affected. Re-applied every ND_MOVE_REAPPLY_SEC because LUIDA's player script sets the rate back
// to 1 when the participant is (re)initialized.
const ND_MOVE_REAPPLY_SEC = 1.0;
function nd_setMove(rate) { $.state.nd_moveRate = rate; $.state.nd_moveApplyIn = 0; }
function nd_tick(dt) {
  $.state.nd_moveApplyIn = ($.state.nd_moveApplyIn || 0) - dt;
  if ($.state.nd_moveApplyIn > 0) return;
  $.state.nd_moveApplyIn = ND_MOVE_REAPPLY_SEC;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const rate = (typeof $.state.nd_moveRate === 'number') ? $.state.nd_moveRate : 0;
  try { p.setMoveSpeedRate(rate); } catch (e) { $.log('[NpcDirector] setMoveSpeedRate failed: ' + e); }
}
";

    // ------------------------------------------------------------------ AvatarGate
    static List<StateListener> AvatarGateListeners()
    {
        return new List<StateListener>
        {
            Listener(S_START, L(Act(T_ShowItem), Custom("ag_showButtons(false, false); HideChild('Text'); ag_photos(false);"))),
            Listener(S_TSTART,
                L(Sleep(0.5f), Custom("ag_begin();")),
                L(Custom("ag_update(deltaTime);")),
                L(Custom("ag_end();"))),
        };
    }

    const string AvatarGateLegacy = @"// ---- Study 4: AvatarGate (avatar switch instruction + automatic check + two-step confirmation) ----
// Bone-length signature of the LUIDA ""Default Avatar"" (participantAvatarMode = DEFAULT; luida_default_avatar).
// Not measured yet: while AG_D_ARM / AG_D_SHOULDER are 0 the automatic check is off and the gate relies on
// the participant's two-step self-report (recorded as avatarCheckFallback = true). To calibrate, wear the
// Default Avatar in Cluster, read the ""[AvatarGate] signature"" log line and put its values here.
const AG_D_ARM = 0;          // upper arm + forearm (m)
const AG_D_SHOULDER = 0;     // distance between the two upper-arm joints (m)
const AG_TOL = 0.015;
const AG_STABLE_MS = 1000;
// If the automatic check has not matched after this many seconds, show the button anyway and rely on
// the participant's two-step self-report (recorded as avatarCheckFallback). 0 disables the fallback.
const AG_FALLBACK_SEC = 30;
const AG_LOG_SEC = 5;          // log the measured bone-length signature this often (calibration aid)

function ag_send(id, cfg) {
  try { const h = $.worldItemReference(id); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[AvatarGate] send ' + id + ': ' + e); }
}
function ag_showButtons(changed, yesNo) {
  ag_send('AG_Changed', { visible: changed, label: '着替えました' });
  ag_send('AG_Yes', { visible: yesNo, label: 'はい' });
  ag_send('AG_No', { visible: yesNo, label: 'いいえ' });
}
// Photo 1: open the menu and tap 'Avatar'. Photo 2 picks 'LUIDA Default Avatar', so it is shown only when that is
// the avatar to wear (in the daily-avatar block it could lead to the wrong choice).
function ag_photos(show) {
  if (show) ShowChild('MenuPhoto1'); else HideChild('MenuPhoto1');
  if (show && $.state.ag_avatar === 'assigned') ShowChild('MenuPhoto2'); else HideChild('MenuPhoto2');
}
function ag_signature(p) {
  const ua = p.getHumanoidBonePosition(HumanoidBone.LeftUpperArm);
  const la = p.getHumanoidBonePosition(HumanoidBone.LeftLowerArm);
  const h = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rua = p.getHumanoidBonePosition(HumanoidBone.RightUpperArm);
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const hips = p.getHumanoidBonePosition(HumanoidBone.Hips);
  const root = p.getPosition();
  if (!ua || !la || !h || !rua || !head || !root) return null;
  return {
    armLen: ua.clone().sub(la).length() + la.clone().sub(h).length(),
    shoulder: ua.clone().sub(rua).length(),
    headH: head.y - root.y,
    hipsH: hips ? hips.y - root.y : -1,
  };
}
function ag_calibrated() { return AG_D_ARM > 0 && AG_D_SHOULDER > 0; }
function ag_isDefault(s) {
  return ag_calibrated() && !!s && Math.abs(s.armLen - AG_D_ARM) < AG_TOL && Math.abs(s.shoulder - AG_D_SHOULDER) < AG_TOL;
}
function ag_targetMatches(sig) {
  if (!sig || !ag_calibrated()) return false;
  const isDefault = ag_isDefault(sig);
  return $.state.ag_avatar === 'assigned' ? isDefault : !isDefault;
}
function ag_begin() {
  $.state.ag_active = false;
  if (!CONDITION || CONDITION['rep'] !== '1') {
    // second trial of a block: no avatar change, skip the setup immediately
    HideChild('Text');
    ag_showButtons(false, false);
    ToNextState();
    return;
  }
  const dailyFirst = CONDITION['order'] === 'daily_first';
  $.state.ag_avatar = (dailyFirst === (CONDITION['block'] === '1')) ? 'daily' : 'assigned';
  $.state.ag_step = 1;
  $.state.ag_active = true;
  $.state.ag_startTs = Date.now();
  $.state.ag_retry = 0;
  $.state.ag_lastMatch = null;
  $.state.ag_matchSince = Date.now();
  $.state.ag_okShown = null;
  $.state.ag_fallback = !ag_calibrated();   // not calibrated: self-report only
  $.state.ag_logAt = 0;
  ShowChild('Text');
  ag_photos(true);   // photos of how to switch the avatar, next to the panel
  ag_showButtons(false, false);
  ag_renderText('');
  $.log('[AvatarGate] block ' + CONDITION['block'] + ' -> ' + $.state.ag_avatar);
}
function ag_renderText(note) {
  const daily = $.state.ag_avatar === 'daily';
  let t;
  if ($.state.ag_step === 1) {
    t = daily
      ? 'メニューから、普段いちばんよく使うアバターに\n着替えてください。\n左の鏡に着替えたアバターが映るまで待ってから、\n「着替えました」を押してください。'
      : 'メニューのアバター変更に表示される\n「LUIDA Default Avatar」に着替えてください。\n左の鏡に着替えたアバターが映るまで待ってから、\n「着替えました」を押してください。';
  } else {
    t = daily
      ? 'いま着ているアバターは、\nあなたが普段いちばんよく使うアバターですか？'
      : 'いま着ているのは\n「LUIDA Default Avatar」ですか？';
  }
  if (note) t += '\n' + note;
  SetText(t);
}
function ag_update(dt) {
  if (!$.state.ag_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const sig = ag_signature(p);
  const match = ag_targetMatches(sig);
  if (match !== $.state.ag_lastMatch) { $.state.ag_lastMatch = match; $.state.ag_matchSince = Date.now(); }
  const elapsed = (Date.now() - ($.state.ag_startTs || Date.now())) / 1000;
  if (sig && elapsed >= ($.state.ag_logAt || 0)) {
    $.state.ag_logAt = elapsed + AG_LOG_SEC;
    $.log('[AvatarGate] signature armLen=' + sig.armLen.toFixed(3) + ' shoulder=' + sig.shoulder.toFixed(3) +
          ' headH=' + sig.headH.toFixed(3) + ' calibrated=' + ag_calibrated() + ' default=' + ag_isDefault(sig) + ' target=' + $.state.ag_avatar);
  }
  if (!$.state.ag_fallback && AG_FALLBACK_SEC > 0 && elapsed >= AG_FALLBACK_SEC && !match) {
    $.state.ag_fallback = true;
    $.log('[AvatarGate] automatic check did not match within ' + AG_FALLBACK_SEC + ' s; falling back to self-report');
    $.state.ag_okShown = null;   // force a redraw below
  }
  const ok = $.state.ag_fallback || (match && (Date.now() - ($.state.ag_matchSince || 0)) >= AG_STABLE_MS);
  if (ok !== $.state.ag_okShown) {
    $.state.ag_okShown = ok;
    if ($.state.ag_step === 1) {
      ag_showButtons(ok, false);
      ag_renderText(ok ? '' : ($.state.ag_avatar === 'assigned' ? '（まだ「LUIDA Default Avatar」に\nなっていません）' : '（まだ「LUIDA Default Avatar」の\nままです）'));
    }
  }
  const b = $.getStateCompat('this', 'gate_btn', 'integer');
  if (!(b > 0)) return;
  $.setStateCompat('this', 'gate_btn', 0);
  if (b === 1 && $.state.ag_step === 1 && ok) {
    $.state.ag_step = 2;
    ag_showButtons(false, true);
    ag_renderText('');
  } else if (b === 2 && $.state.ag_step === 2) {
    if (!ok) {
      $.state.ag_step = 1;
      $.state.ag_okShown = null;
      ag_showButtons(false, false);
      ag_renderText('（アバターが一致していません。\nもう一度着替えてください）');
      return;
    }
    ag_confirm(sig);
  } else if (b === 3 && $.state.ag_step === 2) {
    $.state.ag_retry = ($.state.ag_retry || 0) + 1;
    $.state.ag_step = 1;
    $.state.ag_okShown = null;
    ag_showButtons(false, false);
    ag_renderText('');
  }
}
function ag_confirm(sig) {
  $.state.ag_active = false;
  SendDataToCollector('avatar', $.state.ag_avatar);
  SendDataToCollector('avatarArmLen', sig ? sig.armLen : -1);
  SendDataToCollector('avatarShoulder', sig ? sig.shoulder : -1);
  SendDataToCollector('avatarHeadH', sig ? sig.headH : -1);
  SendDataToCollector('avatarHipsH', sig ? sig.hipsH : -1);
  SendDataToCollector('avatarIsDefault', ag_calibrated() ? ag_isDefault(sig) : null);
  SendDataToCollector('setupSec', (Date.now() - ($.state.ag_startTs || Date.now())) / 1000);
  SendDataToCollector('setupRetry', $.state.ag_retry || 0);
  SendDataToCollector('avatarCheckFallback', !!$.state.ag_fallback);
  ProcessAndSaveCollectedData();
  ag_showButtons(false, false);
  ag_photos(false);
  SetText('ありがとうございます。');
  ToNextState();
}
function ag_end() {
  ag_showButtons(false, false);
  HideChild('Text');
  ag_photos(false);
  $.state.ag_active = false;
}
";

    // ------------------------------------------------------------------ DeviceCheck
    const string DcForceLabel = "確認できない場合は\nこちらを押してください";   // = DC_FORCE_LABEL below

    static List<StateListener> DeviceCheckListeners()
    {
        return new List<StateListener>
        {
            Listener(S_START, L(Act(T_ShowItem), Custom("dc_send({ visible: false, label: DC_FORCE_LABEL }); HideChild('Text');"))),
            Listener(S_POSE,
                L(Custom("dc_begin();")),
                L(Custom("dc_update(deltaTime);")),
                L(Custom("dc_end();"))),
        };
    }

    const string DeviceCheckLegacy = @"// ---- Study 4: DeviceCheck (head yaw left/right + both hands above the head) ----
// Runs in the pose-check state (after the avatar switch, before the NPC appears) on the 1st trial of each block,
// with the MirrorPanel's front mirror shown; the 2nd trial of a block skips it immediately.
const DC_YAW_DEG = 25, DC_HANDS_SEC = 1.0, DC_RESCUE_SEC = 60;
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
function dc_send(cfg) { try { const h = $.worldItemReference('DC_Force'); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[DeviceCheck] send: ' + e); } }
function dc_begin() {
  $.state.dc_active = false;
  if (!CONDITION || CONDITION['rep'] !== '1') { ToNextState(); return; }
  $.state.dc_active = true;
  $.state.dc_start = Date.now();
  $.state.dc_left = false; $.state.dc_right = false; $.state.dc_hands = 0;
  $.state.dc_yaw0 = null; $.state.dc_rescue = false; $.state.dc_lastText = '';
  ShowChild('Text');
  dc_send({ visible: false, label: DC_FORCE_LABEL });
  dc_render();
}
function dc_yaw(p) {
  const r = p.getHumanoidBoneRotation(HumanoidBone.Head);
  if (!r) return null;
  const f = new Vector3(0, 0, 1).applyQuaternion(r);
  return Math.atan2(f.x, f.z) * 180 / Math.PI;
}
function dc_angleDiff(a, b) { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function dc_render() {
  const t = 'トラッキングの確認\n' +
    (($.state.dc_left && $.state.dc_right) ? '[済] ' : '[　] ') + '頭を左右に向ける\n' +
    (($.state.dc_hands || 0) >= DC_HANDS_SEC ? '[済] ' : '[　] ') + '両手を頭より上に（1秒）';
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
function dc_update(dt) {
  if (!$.state.dc_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const yaw = dc_yaw(p);
  if (yaw !== null) {
    if ($.state.dc_yaw0 === null || $.state.dc_yaw0 === undefined) $.state.dc_yaw0 = yaw;
    const d = dc_angleDiff(yaw, $.state.dc_yaw0);
    if (d <= -DC_YAW_DEG) $.state.dc_left = true;
    if (d >= DC_YAW_DEG) $.state.dc_right = true;
  }
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const lh = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  if (head && lh && rh && lh.y > head.y && rh.y > head.y) $.state.dc_hands = ($.state.dc_hands || 0) + dt;
  else if (($.state.dc_hands || 0) < DC_HANDS_SEC) $.state.dc_hands = 0;
  const elapsed = (Date.now() - ($.state.dc_start || Date.now())) / 1000;
  if (elapsed > DC_RESCUE_SEC && !$.state.dc_rescue) { $.state.dc_rescue = true; dc_send({ visible: true }); }
  let forced = false;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');
  if (b > 0) { $.setStateCompat('this', 'dc_btn', 0); if ($.state.dc_rescue) forced = true; }
  const passed = $.state.dc_left && $.state.dc_right && ($.state.dc_hands || 0) >= DC_HANDS_SEC;
  if (passed || forced) { dc_finish(elapsed, forced); return; }
  dc_render();
}
function dc_finish(elapsed, forced) {
  $.state.dc_active = false;
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  ProcessAndSaveCollectedData();
  dc_send({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); HideChild('Text'); $.state.dc_active = false; }
";

    // ------------------------------------------------------------------ ReportPanel
    static List<StateListener> ReportPanelListeners()
    {
        return new List<StateListener>
        {
            Listener(S_START, L(Act(T_ShowItem), Custom("rp_hideAll(true); HideChild('Text');"))),
            Listener(S_REPORT,
                L(Custom("rp_begin();")),
                L(Custom("rp_update(deltaTime);")),
                L(Custom("rp_end();"))),
        };
    }

    static List<EventHandlerData> ReportPanelHandlers()
    {
        var update = new EventHandlerData("Update");
        update.actions.Add(Custom("rp_flush();"));
        return new List<EventHandlerData> { update };
    }

    const string ReportPanelLegacy = @"// ---- Study 4: ReportPanel (0-10 rating -> type -> location -> manipulation check) ----
// rp_step: 1 rating, 3 type, 4 location (both only when the rating is >= 1), 2 manipulation check (always last).
// Numbers (0-10, 1-7) use the RP_* grid (4 x 3, rp_btn 1..11). The word options (sensation type, location) use the
// wider RPW_* grid (2 x 4, rp_btn 21..28); RP_Done (rp_btn 12) confirms them. When 'その他' is chosen, '決定' asks
// for a short text (Cluster text input) saved as ptypeOther / plocOther; closing the input, or pressing '決定'
// again, leaves it empty. ptype / ploc hold the 1-based positions in RP_TYPES / RP_LOCS, e.g. '1,5'.
const RP_BTN = ['RP_0', 'RP_1', 'RP_2', 'RP_3', 'RP_4', 'RP_5', 'RP_6', 'RP_7', 'RP_8', 'RP_9', 'RP_10'];
const RP_WORD = ['RPW_0', 'RPW_1', 'RPW_2', 'RPW_3', 'RPW_4', 'RPW_5', 'RPW_6', 'RPW_7'];
const RP_WORD_VALUE0 = 21;
const RP_DONE = 'RP_Done';
const RP_DONE_VALUE = 12;
const RP_TYPES = ['触れられた感じ\n（Touch）', '圧迫感（Pressure）', '温かさ', '冷たさ', 'ピリピリ・チクチク・\nしびれ（Tingling）', 'くすぐったさ・かゆみ', '風が通る感じ', 'その他'];
const RP_LOCS = ['額', '目・目のまわり', '頬', '鼻・鼻のまわり', '唇・口のまわり', 'あご', '頭の側面・耳', 'その他'];
// label fit inside the option buttons: [max width, max height, max size] (m); see Study4Button.js
const RP_FIT = [0.144, 0.085, 0.024];
const RP_FIT_WORD = [0.345, 0.10, 0.018];   // word options: up to 2 lines x 10 full-width glyphs at the question's size
const RP_DONE_FIT = [0.23, 0.07, 0.022];
const RP_OTHER_TITLE = { 3: '「その他」の感覚を、短く書いてください。', 4: '「その他」の場所を、短く書いてください。' };
const RP_TEXT_RETRY_MS = 2000, RP_TEXT_RETRIES = 5;   // the input is asked again while the player is busy
const RP_SKIP_GUARD_MS = 1500;   // a double click on '決定' must not skip the text input
let rp_queue = [];
function rp_enqueue(id, cfg) { rp_queue.push({ id: id, cfg: cfg }); }
// Messages to other items are rate-limited; spread them over frames.
function rp_flush() {
  let n = 0;
  while (rp_queue.length > 0 && n < 4) {
    const m = rp_queue.shift();
    try { const h = $.worldItemReference(m.id); if (h) h.send('btn_cfg', m.cfg); } catch (e) { $.log('[ReportPanel] send ' + m.id + ': ' + e); }
    n++;
  }
}
function rp_hideSet(set) { for (let i = 0; i < set.length; i++) rp_enqueue(set[i], { visible: false, on: false }); }
// Shows the number set or the word set with the given labels; the other set is hidden if it was shown.
function rp_showOptions(labels, multi) {
  const set = multi ? RP_WORD : RP_BTN;
  if ($.state.rp_set === (multi ? 'num' : 'word')) rp_hideSet(multi ? RP_BTN : RP_WORD);
  for (let i = 0; i < set.length; i++) {
    rp_enqueue(set[i], i < labels.length ? { visible: true, label: labels[i], on: false, fit: multi ? RP_FIT_WORD : RP_FIT } : { visible: false, on: false });
  }
  rp_enqueue(RP_DONE, { visible: !!multi, label: '決定', on: false, fit: RP_DONE_FIT });
  $.state.rp_set = multi ? 'word' : 'num';
  $.state.rp_sel = [];
}
// all = true hides every button (Start: each button shows itself when its script starts).
function rp_hideAll(all) {
  const cur = all ? '' : $.state.rp_set;
  if (cur !== 'word' && cur !== 'none') rp_hideSet(RP_BTN);
  if (cur !== 'num' && cur !== 'none') rp_hideSet(RP_WORD);
  if (cur !== 'none') rp_enqueue(RP_DONE, { visible: false, on: false });
  $.state.rp_set = 'none';
}
function rp_begin() {
  $.state.rp_step = 1; $.state.rp_active = true;
  $.state.rp_rating = -1; $.state.rp_mc = -1; $.state.rp_type = ''; $.state.rp_loc = '';
  $.state.rp_typeOther = ''; $.state.rp_locOther = '';
  $.state.rp_wait = 0; $.state.rp_waitMeta = ''; $.state.rp_textRetryAt = 0;
  $.state.rp_startTs = Date.now();
  ShowChild('Text');
  rp_render();
}
function rp_render() {
  const s = $.state.rp_step;
  if (s === 1) {
    SetText('相手の手が近づいたとき、顔に何か感じましたか？\n0：まったく感じなかった　10：非常に強く感じた');
    rp_showOptions(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], false);
  } else if (s === 2) {
    SetText('相手はあなたに注意を向けていると感じましたか？\n1：まったく感じなかった　7：強く感じた');
    rp_showOptions(['1', '2', '3', '4', '5', '6', '7'], false);
  } else if (s === 3) {
    SetText('どんな感覚でしたか？当てはまるものをすべて選び、\n「決定」を押してください。');
    rp_showOptions(RP_TYPES, true);
  } else if (s === 4) {
    SetText('どこに感じましたか？当てはまるものをすべて選び、\n「決定」を押してください。');
    rp_showOptions(RP_LOCS, true);
  }
}
function rp_update(dt) {
  rp_flush();
  if (!$.state.rp_active) return;
  rp_retryText();
  const b = $.getStateCompat('this', 'rp_btn', 'integer');
  if (!(b > 0)) return;
  $.setStateCompat('this', 'rp_btn', 0);
  const s = $.state.rp_step;
  if (s === 1) {
    const idx = b - 1;            // RP_0..RP_10
    if (idx >= 0 && idx <= 10) { $.state.rp_rating = idx; $.state.rp_step = idx >= 1 ? 3 : 2; rp_render(); }
  } else if (s === 2) {
    const idx = b - 1;
    if (idx >= 0 && idx <= 6) { $.state.rp_mc = idx + 1; rp_finish(); }
  } else if (s === 3 || s === 4) {
    if ($.state.rp_wait) {        // waiting for the 'その他' text: the options are locked, '決定' skips it
      if (b === RP_DONE_VALUE && Date.now() - ($.state.rp_waitTs || 0) >= RP_SKIP_GUARD_MS) rp_otherDone('');
      return;
    }
    const labels = s === 3 ? RP_TYPES : RP_LOCS;
    if (b === RP_DONE_VALUE) {
      const sel = $.state.rp_sel || [];
      if (sel.length === 0) return;
      const val = sel.slice().sort((a, b2) => a - b2).map(i => i + 1).join(',');
      if (s === 3) $.state.rp_type = val; else $.state.rp_loc = val;
      if (sel.indexOf(labels.length - 1) >= 0) rp_askOther(s); else rp_next(s);
    } else {
      const idx = b - RP_WORD_VALUE0;   // RPW_0..RPW_7
      if (idx < 0 || idx >= labels.length) return;
      let sel = $.state.rp_sel || [];
      const k = sel.indexOf(idx);
      if (k >= 0) sel.splice(k, 1); else sel.push(idx);
      $.state.rp_sel = sel;
      rp_enqueue(RP_WORD[idx], { on: k < 0 });
    }
  }
}
function rp_next(s) {
  $.state.rp_step = s === 3 ? 4 : 2;   // type -> location -> manipulation check
  rp_render();
}
// ---- 'その他' text ----
function rp_askOther(s) {
  $.state.rp_wait = s;
  $.state.rp_waitTs = Date.now();
  $.state.rp_waitMeta = 'rp_other_' + s + '_' + $.state.rp_waitTs;   // late answers to an older request are ignored
  $.state.rp_textTries = 0;
  SetText('「その他」の内容を、入力欄に書いてください。\n書かない場合は「決定」をもう一度押してください。');
  rp_requestText();
}
function rp_requestText() {
  $.state.rp_textRetryAt = 0;
  $.state.rp_textTries = ($.state.rp_textTries || 0) + 1;
  try {
    const p = PARTICIPANTS[1];
    if (p) p.requestTextInput($.state.rp_waitMeta, RP_OTHER_TITLE[$.state.rp_wait]);
    else $.log('[ReportPanel] no participant for the text input');
  } catch (e) {
    $.log('[ReportPanel] requestTextInput: ' + e);
    $.state.rp_textRetryAt = Date.now() + RP_TEXT_RETRY_MS;
  }
}
function rp_retryText() {
  const at = $.state.rp_textRetryAt || 0;
  if (!$.state.rp_wait || at <= 0 || Date.now() < at) return;
  if (($.state.rp_textTries || 0) >= RP_TEXT_RETRIES) { $.state.rp_textRetryAt = 0; return; }
  rp_requestText();
}
function rp_clean(t) { return String(t || '').replace(/[\r\n\t]+/g, ' ').trim(); }
function rp_otherDone(text) {
  const s = $.state.rp_wait;
  $.state.rp_wait = 0; $.state.rp_waitMeta = ''; $.state.rp_textRetryAt = 0;
  if (s === 3) $.state.rp_typeOther = text; else $.state.rp_locOther = text;
  rp_next(s);
}
$.onTextInput((text, meta, status) => {
  try {
    if (!$.state.rp_active || !$.state.rp_wait || meta !== $.state.rp_waitMeta) return;
    if (status === TextInputStatus.Success) rp_otherDone(rp_clean(text));
    else if (status === TextInputStatus.Busy) $.state.rp_textRetryAt = Date.now() + RP_TEXT_RETRY_MS;
    else rp_otherDone('');        // Refused: the participant closed the input without writing
  } catch (e) { $.log('[ReportPanel] text input: ' + e); }
});
function rp_finish() {
  $.state.rp_active = false;
  $.state.rp_wait = 0;
  SendDataToCollector('rating', $.state.rp_rating);
  SendDataToCollector('mc', $.state.rp_mc);
  SendDataToCollector('ptype', $.state.rp_type || '');
  SendDataToCollector('ptypeOther', $.state.rp_typeOther || '');
  SendDataToCollector('ploc', $.state.rp_loc || '');
  SendDataToCollector('plocOther', $.state.rp_locOther || '');
  SendDataToCollector('reportDoneTs', Date.now());
  ProcessAndSaveCollectedData();
  rp_hideAll();
  SetText('ありがとうございます。');
  ToNextState();
}
function rp_end() { rp_hideAll(); HideChild('Text'); $.state.rp_active = false; $.state.rp_wait = 0; }
";

    // ------------------------------------------------------------------ MirrorPanel
    static List<StateListener> MirrorPanelListeners()
    {
        return new List<StateListener>
        {
            // both mirrors hidden at Start (also after a session reset from the middle of a trial)
            Listener(S_START, L(Act(T_ShowItem), Act(T_HideChild, ("childName", "Mirror")), Act(T_HideChild, ("childName", "MirrorFront")))),
            // avatar switch (trial start): the front-left mirror, so the participant sees the new avatar load (the
            // gate panel is straight ahead). Unconditional: in the 2nd trial of a block it stays on into the greeting.
            Listener(S_TSTART, L(Act(T_ShowChild, ("childName", "Mirror")))),
            // pose check (1st trial of each block): the mirror straight ahead instead
            Listener(S_POSE, L(If(Act(T_ShowChild, ("childName", "MirrorFront")), "rep", "1"),
                               If(Act(T_HideChild, ("childName", "Mirror")), "rep", "1")), null,
                L(Act(T_HideChild, ("childName", "MirrorFront")))),
            Listener(S_GREET, L(Act(T_ShowChild, ("childName", "Mirror")))),
            Listener(S_TOUCH, null, null, L(Act(T_HideChild, ("childName", "Mirror")))),
        };
    }

    // ------------------------------------------------------------------ ExitPortal
    static List<StateListener> ExitPortalListeners()
    {
        return new List<StateListener>
        {
            Listener(S_START, L(Act(T_ShowItem), Act(T_HideChild, ("childName", "WorldGateToLuidaBar")))),
            Listener(S_END, L(Custom("ep_begin();")), L(Custom("ep_update();"))),
        };
    }

    // The gate (CCK World Gate) moves the participant as soon as they touch it, so it is enabled only after the
    // End countdown, far from the spawn point, and the participant is teleported into it (the same way
    // ParticipantManager.js sends rejected players away). Nothing is left at the spawn point for the next
    // participant who joins the same space. The item sits at the standing spot (ApplyLayout).
    static string ExitPortalLegacy()
    {
        return "// ---- Study 4: ExitPortal (participant teleported into a gate far from the spawn point) ----\n" +
               "const EP_DELAY_SEC = " + EndGateDelaySec + ";\n" +
               "const EP_GATE_OFFSET = new Vector3(" + F(ExitGateOffset.x) + ", " + F(ExitGateOffset.y) + ", " + F(ExitGateOffset.z) + ");   // item-local\n" +
               "function ep_begin() { $.state.ep_startTs = Date.now(); $.state.ep_shown = false; }\n" +
               "function ep_update() {\n" +
               "  if ($.state.ep_shown) return;\n" +
               "  if (Date.now() - ($.state.ep_startTs || Date.now()) < EP_DELAY_SEC * 1000) return;\n" +
               "  const gate = $.subNode('WorldGateToLuidaBar');\n" +
               "  if (!gate) return;\n" +
               "  gate.setPosition(EP_GATE_OFFSET);\n" +
               "  gate.setEnabled(true);\n" +
               "  $.state.ep_shown = true;\n" +
               "  const p = PARTICIPANTS[1];\n" +
               "  if (p && p.exists()) {\n" +
               "    p.setPosition($.getPosition().add(EP_GATE_OFFSET.clone().applyQuaternion($.getRotation())).add(new Vector3(0, 0.5, 0)));\n" +
               "    $.log('[ExitPortal] participant teleported to the exit gate');\n" +
               "  } else {\n" +
               "    $.log('[ExitPortal] gate shown (participant not found)');\n" +
               "  }\n" +
               "}\n";
    }

    static void ParkExitGate()
    {
        var ep = FindRoot("ExitPortal");
        var gateNode = ep != null ? ep.Find("WorldGateToLuidaBar") : null;
        if (gateNode == null) { Debug.LogWarning("[Study4] ExitPortal/WorldGateToLuidaBar not found"); return; }
        gateNode.localPosition = ExitGateOffset;
        gateNode.localRotation = Quaternion.identity;
        EditorUtility.SetDirty(gateNode);
    }

}
#endif

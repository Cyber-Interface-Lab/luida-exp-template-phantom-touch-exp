const trialsCountForEachUniqueCondition = 1;
const within_subjects_variables = [
    { name: "block", values: ["1", "2"], isRandom: false },
    { name: "social", values: ["with", "without"], isRandom: true },
];
const between_subjects_variables = [
    { name: "order", values: ["daily_first", "assigned_first"], isRandom: true, debugValue: null },
];
const state_names = ["Start", "Trial - Start", "Trial - PoseCheck", "Trial - Greeting", "Trial - Touch", "Trial - Report", "SocialPresence", "Trial - VEQ", "Trial - Rest", "PersonalExperience", "Debrief", "End"];

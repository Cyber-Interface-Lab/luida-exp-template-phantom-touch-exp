const trialsCountForEachUniqueCondition = 1;
const within_subjects_variables = [
    { name: "block", values: ["1", "2"], isRandom: false },
    { name: "rep", values: ["1", "2"], isRandom: false },
];
const between_subjects_variables = [
    { name: "social", values: ["with", "without"], isRandom: true, debugValue: null },
    { name: "order", values: ["daily_first", "assigned_first"], isRandom: true, debugValue: null },
];
const state_names = ["Start", "DeviceCheck", "Trial - Start", "Trial - Touch", "Trial - Report", "Trial - VEQ1", "Trial - VEQ2", "Trial - Rest", "SocialPresence", "PersonalExperience", "Debrief", "End"];

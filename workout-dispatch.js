const WORKOUT_BUILDERS={lower_strength:build_lower_strength,shoulders_arms:build_shoulders_arms,chest:build_chest,back:build_back,lower_hypertrophy:build_lower_hypertrophy,upper_specialization:build_upper_specialization};
function optionsFor(workoutKey,variant,u){return (WORKOUT_BUILDERS[workoutKey]||build_upper_specialization)(variant,u)}

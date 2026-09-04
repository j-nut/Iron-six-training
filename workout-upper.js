function build_upper_specialization(variant,u){
 const v=variant%3;
 const O={};

 const press=v===1?[ex('Incline Barbell Bench Press',['barbell','rack','bench'],'3 × 6–10',3,'Chest','Upper press','bench',1),ex('Incline Dumbbell Press',['dumbbells','bench'],'3 × 8–12',3,'Chest','Upper press','bench',1),ex('Push-Up',[],'3 × 10–20',3,'Chest','Upper press','bench',1)]:[ex('Barbell Bench Press',['barbell','rack','bench'],'3 × 6–10',3,'Chest','Upper press','bench',1),ex('Dumbbell Bench Press',['dumbbells','bench'],'3 × 8–12',3,'Chest','Upper press','bench',1),ex('Push-Up',[],'3 × 10–20',3,'Chest','Upper press','bench',1)];
 const row=v===2?[ex('Landmine T-Bar Row',['barbell','landmine'],'3 × 8–12',3,'Back','Upper pull','row',1),ex('Chest-Supported Dumbbell Row',['dumbbells','bench'],'3 × 8–12',3,'Back','Upper pull','row',1),ex('Band Row',['bands'],'3 × 12–20',3,'Back','Upper pull','row',1)]:[ex('Barbell Row',['barbell'],'3 × 6–10',3,'Back','Upper pull','row',1),ex('Landmine Row',['barbell','landmine'],'3 × 8–12',3,'Back','Upper pull','row',1),ex('One-Arm Dumbbell Row',['dumbbells'],'3 × 8–12',3,'Back','Upper pull','row',1),ex('Band Row',['bands'],'3 × 12–20',3,'Back','Upper pull','row',1)];
 const shoulder=[ex('Landmine Press',['barbell','landmine'],'3 × 8–12 each arm',3,'Shoulders','Vertical press','overhead_press'),ex('Dumbbell Shoulder Press',['dumbbells'],'3 × 8–12',3,'Shoulders','Vertical press','overhead_press'),ex('Pike Push-Up',[],'3 × 8–15',3,'Shoulders','Vertical press','overhead_press')];
 const vertical=[ex('Pull-Up',['pullup'],'3 × 5–10',3,'Back','Vertical pull','pullup'),ex('Band Lat Pulldown',['bands'],'3 × 10–15',3,'Back','Vertical pull','pullup'),ex('Prone Lat Pull',[],'3 × 10–15',3,'Back','Vertical pull','pullup')];
 const lateral=[ex('Dumbbell Lateral Raise',['dumbbells'],'3 × 12–20',3,'Delts','Lateral delts','lateral_raise'),ex('Band Lateral Raise',['bands'],'3 × 15–25',3,'Delts','Lateral delts','lateral_raise'),ex('Lean-Away Lateral Raise',[],'3 × 12–20',3,'Delts','Lateral delts','lateral_raise')];
 const arms=[ex('Dumbbell Curl + Band Pressdown',['dumbbells','bands'],'3 supersets × 10–15 each',3,'Arms','Arms finisher','arms'),ex('Barbell Curl + Close-Grip Push-Up',['barbell'],'3 supersets × 8–12 each',3,'Arms','Arms finisher','arms'),ex('Bodyweight Curl Isometric + Diamond Push-Up',[],'3 supersets',3,'Arms','Arms finisher','arms')];
 return [slot(u,press),slot(u,row),slot(u,shoulder),slot(u,vertical),slot(u,lateral),slot(u,arms)];

}

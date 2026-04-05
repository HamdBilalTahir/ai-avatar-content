export const CHARACTERS_HOST = `
Reference Image: The woman in the reference image
Eye Line: Always looks left toward the off-camera man. Never looks at the camera.
Expression: Attentive and warm. No performance. No presenter energy.
`;

export const CHARACTERS_GUEST = `
Reference Image: The man in the reference image
Eye Line: Always looks right toward the off-camera woman. Never looks at the camera.
Voice: Deep warm Arabic English accent, light Gulf or Levant. Slow deliberate pace. Conversational volume. Unhurried.
Expression: Thoughtful and honest. Not performing. Not selling.
`;

export const SET = `
Background: Deep dark teal green wall. Rich dark green with blue undertones. No windows, no art, no decoration.
Lighting: Warm amber key light from slightly above and in front of the speaker. Soft shadows under cheekbones. Deep shadow behind. No cool tones. No rim lights.
Desk: Simple dark wooden desk. Nothing on the surface.
`;

export const MICROPHONE = `
A Shure SM7B dynamic microphone. Large dark grey rectangular body on a black articulating boom arm fixed to the desk. Positioned at mouth height in front of the speaker. Always fully visible in frame. Never cropped. Identical in every shot.
`;

export const CINEMATOGRAPHY_CLOSE = `
Camera: Smartphone on a desktop mount. Locked still. Does not move.
Framing: Eye level. Mid-chest to top of head. Subject slightly left of centre. Microphone visible upper frame.
Look: Slightly grainy. Natural skin. Real blinking. Looks like someone set up their phone and pressed record.
`;

export const CINEMATOGRAPHY_WIDE = `
Camera: Smartphone on a desktop mount. Locked still. Does not move.
Framing: Both subjects visible. Camera faces them straight on. Man at far LEFT end of table. Woman at far RIGHT end of table. Wide table with visible empty space between them. Both microphones visible.
Look: Slightly grainy. Real blinking from both people. Looks like someone set up their phone and pressed record.
`;

export const BLOCKING_GUEST = `
Only the man is visible. No part of any other person appears in this frame. The man is left of centre. His eye line points right toward the off-camera woman.
`;

export const BLOCKING_HOST = `
Only the woman is visible. No part of any other person appears in this frame. The woman is right of centre. Her eye line points left toward the off-camera man.
`;

export const BLOCKING_BOTH = `
Man on the LEFT. Woman on the RIGHT. Both visible. Both microphones visible. Neither looks at the camera.
`;

export const SOUND = `
Audio: Speaker voice and faint room tone only. No music. No background sounds. No laughter track. No live audience.
`;

export const VOICE_GUEST = `
Voice: Deep warm Arabic English. Light Gulf or Levant accent. Slow deliberate pace. Conversational volume.
`;

export const VOICE_HOST = `
Voice: Warm measured Middle Eastern English. Calm pace. Natural volume. Smooth unhurried timbre.
`;

export const VIDEO_STYLE = `
Style: Real smartphone podcast footage. Slightly grainy. Real not produced.
Human Movement: Natural involuntary movement throughout. Eyes open and blinking normally. Lips move naturally when speaking. No robotic or performed movement.
No subtitles. No captions. No text on screen. No music. No graphics. No watermarks. (no subtitles)
Single speaker rule: Only one person visible per close shot. No second person. No shoulder. No arm. No silhouette.
`;

export const PODCAST_SHOTS = [
  {
    shot_number: 1,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
${VIDEO_STYLE}
${CINEMATOGRAPHY_CLOSE}
${BLOCKING_GUEST}
${SET}
${MICROPHONE}
${SOUND}
${CHARACTERS_GUEST}

SHOT NUMBER: 1
SHOT TYPE: CLOSE
SUBJECT: The man shown in the reference image
DOMINANT ACTION: A man sits at a desk in a dark studio. He is already mid-thought when the camera finds him. He is about to begin recalling a specific memory.

CRITICAL: DO NOT GENERATE SUBTITLES. DO NOT GENERATE CAPTIONS. DO NOT GENERATE ANY TEXT ON SCREEN OF ANY KIND. The man speaks but the screen remains completely clean. No text appears anywhere on screen at any time during this shot.

SECOND PERSON: There is no second person visible in this shot. No shoulder. No arm. No blurred silhouette. No part of any other person appears in this frame. Only the man and the background wall.

PHYSICAL STATE AT SHOT START:
A man is seated slightly forward at a simple dark wooden desk. Both forearms rest on the desk surface with palms facing downward. He is looking to the right toward an empty space off-camera. A large dark grey rectangular microphone on a black boom arm is visible in the upper portion of the frame directly in front of his face at mouth height. A deep dark teal green wall fills the entire background behind him. His jaw is loose. His shoulders are relaxed. His expression is neutral and inward.

WHAT THIS PERSON IS FEELING AND THINKING:
He is about to tell someone something he has told before. It is not painful. More like the mild amusement of someone who can now see clearly something that used to be invisible to them. He is relaxed. He is comfortable in this conversation. He is not nervous and not performing. He genuinely wants the other person to understand what he is about to say.

DIALOGUE:
The man speaks directly to the person off-camera to his right. He speaks at a natural unhurried conversational pace. His lips move the way real lips move when speaking casually to someone you know well.

He says: My accountant calls me one morning. Says I need to show you something. Come in early. (Tone: calm and conversational, the way a person starts telling a story to a friend over dinner, no urgency, no heightened delivery)

He pauses naturally. His eyes drop toward the desk for a moment the way a person's eyes naturally drop when they are retrieving a specific memory. Then his eyes return toward the off-camera person.

He says: I thought it was a tax issue. (Tone: dry, self-aware, the faint amusement of someone who was wrong about something and now knows it)

After this he is quiet. He looks toward the off-camera person. He does not speak. A natural silence sits between them for a moment before the shot ends.

NEGATIVE PROMPTS:
No subtitles. No captions. No auto-generated text. No closed captions. No text of any kind on screen. The man does not look at the camera lens at any time. No exaggerated expressions. No performed reactions. No cinematic lighting effects. No film grain filters. No colour grading effects. Slightly grainy natural smartphone look only. No second person visible in frame whatsoever.
`,
  },
  {
    shot_number: 2,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
${VIDEO_STYLE}
${CINEMATOGRAPHY_CLOSE}
${BLOCKING_GUEST}
${SET}
${MICROPHONE}
${SOUND}
${VOICE_GUEST}
${CHARACTERS_GUEST}

SHOT NUMBER: 2
SHOT TYPE: CLOSE
DOMINANT ACTION: A man at a desk names the first two items of a three item list then pauses before the third.

No subtitles. No captions. No text on screen. No music. No background audio except room tone and the mans voice.

EYES OPEN: The mans eyes are open and alert throughout this entire shot. He does not close his eyes at any point. He blinks naturally.

NO HAND MOVEMENTS: The mans hands remain flat and still on the desk surface for the entire duration of this shot. Both palms face downward. No counting gesture. No pointing. No finger extension. No movement of hands or fingers at any point.

NO SECOND PERSON: Only this one man is visible in this shot. No other person. No shoulder. No arm. No silhouette. Nothing.

PHYSICAL STATE AT SHOT START:
A man is seated slightly forward at a simple dark wooden desk. Both forearms rest flat on the desk with palms facing downward. He is looking to the right toward an empty space off-camera. His eyes are open and alert. A large dark grey rectangular microphone on a black boom arm is visible in the upper portion of the frame at mouth height. A deep dark teal green wall fills the entire background.

PHYSICAL STATE AT SHOT END:
The man is in the exact same position. Both forearms on the desk. Both palms flat. He is looking right toward the off-camera person. He is mid-pause. Completely still.

WHAT THIS PERSON IS FEELING AND THINKING:
He is walking the other person through something structured. The third item is the one that matters most and he is letting the natural pause before it do the work.

AUDIO: Room tone only. No music. No background sounds. Only the mans voice speaking naturally.

DIALOGUE: (no subtitles) (no captions) (no text on screen)
The man speaks looking right toward the off-camera person. His hands stay flat on the desk throughout.
Man says: He sits me down. Opens a spreadsheet. Says look at these three things. (no subtitles)
Brief natural pause.
Man says: First. What your team bills out every month. (no subtitles)
Brief natural pause.
Man says: Second. What lands in the bank after costs. (no subtitles)
He pauses longer. His hands remain flat and still. He looks at the off-camera person. The shot ends on this pause. The third item has not yet been named.

No subtitles. No captions. No text on screen. No music.
`,
  },
  {
    shot_number: 3,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
${VIDEO_STYLE}
${CINEMATOGRAPHY_CLOSE}
${BLOCKING_GUEST}
${SET}
${MICROPHONE}
${SOUND}
${VOICE_GUEST}
${CHARACTERS_GUEST}

SHOT NUMBER: 3
SHOT TYPE: CLOSE
DOMINANT ACTION: A man at a desk names the third and final item of a list then admits he had no answer for it. Then silence.

No subtitles. No captions. No text on screen. No music. No background audio except room tone and the mans voice.

SINGLE SPEAKER: Only this one man speaks in this shot. No other voice. No other person.

EYES OPEN: The mans eyes are open and alert throughout this entire shot. He does not close his eyes at any point. He blinks naturally.

NO HAND MOVEMENTS: The mans hands remain flat and still on the desk surface for the entire duration of this shot. Both palms face downward. No counting gesture. No pointing. No finger extension. No movement of hands or fingers at any point.

NO SECOND PERSON: Only this one man is visible and audible in this shot. No other person. No shoulder. No arm. No silhouette. No second voice.

PHYSICAL STATE AT SHOT START:
A man is seated slightly forward at a simple dark wooden desk. Both forearms rest flat on the desk with palms facing downward. He is looking to the right toward an empty space off-camera. His eyes are open and alert. He is in a natural pause about to name the third item. A large dark grey rectangular microphone on a black boom arm is visible in the upper portion of the frame at mouth height. A deep dark teal green wall fills the entire background.

WHAT THIS PERSON IS FEELING AND THINKING:
The third item is the one that mattered most. He names it plainly. His admission that he had no answer for it is just honest. He lets the silence after it sit naturally.

AUDIO: Room tone only. No music. No background sounds. Only the mans voice speaking naturally.

DIALOGUE: (no subtitles) (no captions) (no text on screen)
The man looks right toward the off-camera person. His hands stay flat on the desk throughout.
Man says: Third. How much of your cost is people doing the same task every single day. (no subtitles)
Brief natural pause.
Man says: I did not have an answer for the third one. (no subtitles)
He is then completely still. He looks toward the off-camera person. A long natural silence sits. He does not move. He does not speak. His hands remain flat. The shot holds on his face in this silence.

No subtitles. No captions. No text on screen. No music.
`,
  },
  {
    shot_number: 4,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
${VIDEO_STYLE}
${CINEMATOGRAPHY_CLOSE}
${BLOCKING_HOST}
${SET}
${MICROPHONE}
${SOUND}
${VOICE_HOST}

SHOT NUMBER: 4
SHOT TYPE: CLOSE
DOMINANT ACTION: A woman at a desk makes a short honest observation to someone off-camera to her left. Then she waits.

No subtitles. No captions. No text on screen. No music.

SINGLE SPEAKER: Only this one woman speaks. No other voice. No other person.

NO HAND MOVEMENTS: Both hands flat and still on desk throughout. No gesturing.

NO SECOND PERSON: Only this one woman visible. No shoulder. No arm. No silhouette.

PHYSICAL STATE AT SHOT START:
The woman shown in the reference image is seated at a simple dark wooden desk. Her body is angled 30 to 40 degrees to the left. Her shoulders face left. Her chest faces left. Her head turns left naturally following her body. Both forearms rest flat on the desk with palms facing downward.

EYE LINE IS CRITICAL:
Her eyes are directed to the LEFT toward a specific fixed point off-camera approximately 60 centimetres to the left of the camera lens and at the same height as the camera. She is looking at a real person sitting there. Her gaze is direct, warm and focused on that exact point. She does not glance around. She does not look at the camera. She does not look downward. Her eyes lock onto the off-camera person and stay there for the entire shot. This is the steady attentive eye contact of someone fully engaged in a real conversation.

Her right cheek is the dominant cheek visible to the camera. Her right eye is most visible. Her left side faces toward the off-camera person. The microphone is visible between her face and the left edge of the frame at mouth height.

WHAT THIS PERSON IS FEELING AND THINKING:
She genuinely finds what she just heard interesting. She speaks the way a person speaks when they mean something simply and clearly. Her attention never leaves the off-camera person.

Ambient: quiet podcast studio, faint room hum, no music.

DIALOGUE:
The woman leans very slightly forward toward the off-camera person to her left. Her eyes remain locked left on the off-camera person. Her hands stay flat on the desk.
Woman says: "You had never seen it that way." (no subtitles)
She finishes and settles back slightly. Her eyes remain looking left toward the off-camera person. She waits quietly. Shot holds on her face.

No subtitles. No captions. No text on screen. No music.
`,
  },
  {
    shot_number: 5,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
${VIDEO_STYLE}
${CINEMATOGRAPHY_CLOSE}
${BLOCKING_GUEST}
${SET}
${SOUND}
${VOICE_GUEST}
${CHARACTERS_GUEST}

SHOT NUMBER: 5
SHOT TYPE: CLOSE
DOMINANT ACTION: A man at a desk responds with four words. Then silence.

No subtitles. No captions. No text on screen. No music. No background audio except room tone and the mans voice.

SINGLE SPEAKER: Only this one man speaks in this shot. No other voice. No other person.

EYES OPEN: The mans eyes are open and alert throughout this entire shot. He does not close his eyes at any point. He blinks naturally.

NO HAND MOVEMENTS: The mans hands remain flat and still on the desk surface for the entire duration of this shot. Both palms face downward. No gesturing. No pointing. No movement of hands or fingers at any point.

NO SECOND PERSON: Only this one man is visible and audible in this shot. No other person. No shoulder. No arm. No silhouette. No second voice.

PHYSICAL STATE AT SHOT START:
A man is seated slightly forward at a simple dark wooden desk. Both forearms rest flat on the desk with palms facing downward. He is looking to the right toward an empty space off-camera. His eyes are open and calm. A large dark grey rectangular microphone on a black boom arm is visible in the upper portion of the frame at mouth height. A deep dark teal green wall fills the entire background. His expression is honest and still.

WHAT THIS PERSON IS FEELING AND THINKING:
His response is the plainest truth he knows. He is not defensive or emotional. He means it completely. After he says it he lets the silence sit.

AUDIO: Room tone only. No music. No background sounds. Only the mans voice speaking naturally.

DIALOGUE: (no subtitles) (no captions) (no text on screen)
The man looks right toward the off-camera person. His hands stay flat and still on the desk.
Man says: Nobody ever told me to. (no subtitles)
He is then completely still. He looks toward the off-camera person. A long natural silence sits. He does not move. He does not speak. His hands remain flat. The shot holds on his face in this silence.

No subtitles. No captions. No text on screen. No music.
`,
  },
  {
    shot_number: 6,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
${VIDEO_STYLE}
${CINEMATOGRAPHY_CLOSE}

NO SECOND PERSON: Only this one woman visible. No shoulder. No arm. No silhouette.


REACTION SEQUENCE — four distinct natural reactions each lasting approximately 2 seconds:

Seconds 0 to 2 — FORWARD LEAN OF INTEREST:
She leans forward from the waist by two to three inches toward the off-camera person. Her eyes widen very slightly. Her lips part a fraction. The physical expression of someone who just heard something surprising and wants to hear more. Her head tilts very slightly to the right as if to get closer to the story.

Seconds 2 to 4 — QUIET NOD OF RECOGNITION:
She settles back slightly from the lean. Her chin drops once in a single slow deliberate nod. The nod of someone who recognises exactly what is being described. A faint trace of a knowing smile at the corner of her mouth. Her eyes remain locked on the off-camera person.

Seconds 4 to 6 — SLIGHT RAISE OF EYEBROWS:
Her eyebrows lift slightly. Not dramatically. The involuntary micro-expression of someone who just heard a number or fact that genuinely surprises them. Her lips press together lightly. She inhales a barely audible breath through the nose. Her head is still.

Seconds 6 to 8 — SETTLE INTO STILLNESS:
Her expression settles. The surprise fades into a quiet focused attentiveness. She looks left with steady warm eye contact toward the off-camera person. She is completely still. Waiting. Ready to speak but not yet speaking. The expression of someone who has just heard something important and is processing it.

EYES: Her eyes remain directed left toward the off-camera person throughout all four reactions. She never looks at the camera. Her eye line is fixed on a point approximately 60 centimetres to the left of the camera lens at the same height as the camera.
`,
  },
  {
    shot_number: 7,
    duration: 4,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A hyper-realistic macro 3D animation. An iPhone lying flat on a dark mahogany nightstand in a pitch black bedroom. The screen is dark. The time reads 5:30 AM. Suddenly the phone vibrates. The screen lights up with an incoming call. The name reads simply: Accountant. Cold blue white glow spills onto the dark wood surface and spreads across the darkness. The phone buzzes again. Nobody picks it up yet. The camera holds on the glowing screen. The room stays completely dark except for this one cold light source cutting through the black.
SFX: Two short sharp phone vibration buzzes on hard wood. Low quiet room tone underneath. No music.
Style: Photorealistic 3D. Dark and tense. Cold blue clinical lighting. Deep blacks. The phone screen is the only light source in the entire frame.
No text on screen. No subtitles. No UI overlays.
`,
  },
  {
    shot_number: 8,
    duration: 6,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A kinetic flat motion graphics animation. Clean white background. Large bold icons appear one at a time flying in from the right with a satisfying snap. First a visa document icon in coral red. Then a health insurance shield in bright gold. Then a house icon in deep blue. Then a plane ticket in emerald green. Each icon lands on a horizontal timeline with a sharp click. As each lands a bold number appears beneath it in clean black sans-serif. All four icons simultaneously shoot upward and land inside a large dark bucket with a single dirham symbol. The bucket fills. A bold number grows rapidly above it. Stops at 400,000. Pulses once. Holds.
SFX: Four sharp snap sounds as each icon lands. A whoosh as they fly into the bucket. A deep thud as the bucket fills. A single high ping when the number stops at 400,000.
Style: Flat 2D motion graphics. Bold. Clean. Bright coral, gold, deep blue, emerald green on white. Fast and punchy.
No subtitles. No text except the dirham symbol and the number 400,000.
`,
  },
  {
    shot_number: 9,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A hyper-realistic tactile 3D animation. Close-up of a copper pipe running horizontally through a dark concrete wall. Old warm-toned pipe covered in slight green patina. A hairline crack runs along the bottom. From this crack a slow steady drip begins. But instead of water the liquid is molten gold. Liquid gold drops fall in slow motion and hit a dark stone floor below. Each drop splashes slowly and spreads into a small golden puddle. The puddle grows. The crack widens slightly. The drip becomes a trickle. The camera slowly pushes toward the crack. The golden liquid catches warm ambient light. Nobody stops it. The puddle keeps growing.
SFX: Slow drip of liquid hitting stone. Each drop has a soft metallic ring. Low ambient hum underneath. No music. No voice.
Style: Photorealistic 3D. Warm copper and gold tones against dark grey concrete. The gold liquid is the only bright element. Cinematic macro lens. Shallow depth of field. Slow motion.
No text. No subtitles. No UI.
`,
  },
  {
    shot_number: 10,
    duration: 6,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A sci-fi data visualization animation. Deep black void. Three glowing holographic data streams appear from three separate corners of the frame. Electric blue, neon white, and sharp cyan. Each stream is a river of flowing data points, numbers, and small chart fragments moving fast. They converge toward the center. A sleek chrome robotic arm reaches in from the right. It grabs all three streams simultaneously. They freeze for exactly one frame. Then snap together into a single clean glowing white report document. The report assembles itself line by line in under one second. Then fires upward out of frame. The robotic arm retracts. The void is empty. Clean. Instant. Done.
SFX: Three data stream hums converging into one tone. A sharp mechanical snap as the arm grabs. A rapid assembly sound like a fast printer. A clean whoosh as the report fires upward. Silence after.
Style: Sci-fi holographic 3D. Deep black background. Electric blue, neon white, sharp cyan. Fast and precise.
No text. No subtitles. No UI.
`,
  },
  {
    shot_number: 11,
    duration: 6,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A particle and light animation. Deep purple void. From the left side of the frame a stream of soft golden glowing envelopes floats in slow motion. Each envelope pulses gently with warm light. They drift toward the right side of the frame where a large dark circular portal waits. The portal glows softly at its edges with deep teal light. One by one the envelopes enter the portal and dissolve into particles of gold light that scatter and disappear. The portal pulses each time an envelope enters. The last envelope enters. The portal closes slowly. The void is quiet. Three small checkmarks appear and fade one at a time in warm gold light.
SFX: A soft ambient tone throughout. Each envelope entering the portal makes a soft chime. The portal closing makes a low warm resonant tone. Three soft ping sounds for the checkmarks. No music.
Style: Particle and light animation. Deep purple, soft gold, glowing teal. Ethereal and elegant. Slow and deliberate movement.
No text. No subtitles. No UI.
`,
  },
  {
    shot_number: 12,
    duration: 6,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A warm architectural isometric 3D animation. A top-down angled view of a small modern office space rendered in warm terracotta, cream, and olive green tones. Four small stylized human figures sit around a circular digital table. The table surface glows softly. Each figure is distinct in color and posture. One is pointing at a holographic chart above the table. One is writing. One is gesturing to another. One is on a call. All four are active, engaged, and animated. The holographic chart above the table grows upward as they work. Small icons and data points orbit the table slowly. The camera slowly rotates around the scene at a gentle pace.
SFX: Soft ambient office hum. Gentle keyboard clicks. A low warm musical tone barely audible like a single piano note held long. Quiet and human.
Style: Warm isometric 3D. Terracotta, cream, olive green, soft gold. Premium and human. Architectural precision with warmth. Not cold or corporate.
No text. No subtitles. No UI.
`,
  },
  {
    shot_number: 13,
    duration: 8,
    resolution: '720p',
    imageRefs: [],
    prompt: `
A cinematic macro photorealistic 3D animation. The same copper pipe from the earlier shot. But now it is repaired. The crack is gone. The pipe is clean and polished. No patina. No moss. The copper glows warmly under a single amber light source from above. A close-up reveals a brand new brass fitting sealed perfectly over where the crack was. The fitting catches the light and shines. The camera holds on the sealed fitting. Then slowly pulls back to reveal the full length of the pipe running clean and intact through the dark concrete wall. Not a drop of liquid anywhere. The stone floor below is dry. The pipe is whole. The light on the copper and brass is warm and still. The camera holds. Then slowly fades to black.
SFX: Complete silence at the start. Then a single very quiet low tone that grows imperceptibly. No dripping. No movement. Just stillness and the tone. Then silence as it fades to black.
Style: Cinematic macro photorealism. Polished copper and warm brass against dark grey concrete. Deep warm amber light. Quiet and final. The opposite emotional register of shot 9.
No text. No subtitles. No UI.
`,
  },
];

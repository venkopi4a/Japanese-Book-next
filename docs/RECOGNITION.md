# Handwriting recognition: how providers plug in

Nothing in the app talks to a recognition service yet. `src/recognise/provider.ts` defines the interface, and
`activeRecogniser` is currently the placeholder (fixed sample words, clearly labelled in the interface).

## What a provider must do
Receive one cropped photo (JPEG, at most 1568 pixels on the long side) and return an object shaped like:

    { "entries": [ { "text": "電車", "reading": "でんしゃ", "meaning": "train",
                     "topic": null, "note": null, "confidence": "high", "issues": [] } ] }

- `confidence` is high, medium or low. Anything that is not exactly "high" starts as needs-check in the review screen.
- `issues` are short plain-language reasons ("second character unclear") shown beside the word.
- Whatever comes back is validated by `parseRecognition`: text is cleaned and capped, a missing confidence counts as low,
  at most 300 entries per photo are read. Nothing is trusted.
- The app never saves recognised words until the person confirms them. Typed duplicates and words already in the notebook are caught.

## Comparing providers (planned, before choosing one)
Run each candidate on the same handwriting photos and record, per photo: words found, how many are exactly right
(text, reading, meaning separately), how many wrong words were flagged as uncertain (good) or marked high confidence (bad),
missed words, seconds taken, and cost per photo. A provider is only worth using if almost none of its wrong words are marked high.

## Security
A real provider needs a secret key. Keys never go in the app. The app will call a small server function (Supabase) that holds the key,
checks that the caller is signed in, and forwards the photo. That arrives with accounts, in Stage 3.

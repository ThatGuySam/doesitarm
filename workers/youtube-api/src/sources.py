"""Video snapshot sources: the playlists the updater turns into youtube-videos.json.

Edit this list to add or remove playlists, then deploy the updater
(`cd updater && npx wrangler deploy`). The next snapshot run picks it up; run
`POST /admin/snapshot-step` on the updater to start at once (see README).

Each entry:
- id: a playlist ID (PL...), or a channel's uploads playlist (UU... = "UC" -> "UU").
- name: who and what, for humans.
- tags: optional; added to every video in this playlist. "benchmark" feeds the
  Does It ARM benchmark tag (it was the only tag the old YouTube Data API reader set).

Order matters only for duplicates: a video in several playlists is filed under the
first one listed (its rawData.snippet.playlistId, position and channelTitle), and
gets the tags of all of them. Keep the list modest: every playlist is swept daily
and each new video costs one extraction (about 3 to 5 YouTube requests).

Historical list: helpers/api/youtube/playlists.js before commit 63b5534.
"""

SOURCES = [
    {"id": "PLz5rnvLVJX5XF8cXAOQuarPIeP8Xr7b1_", "name": "Awais Mirza - Apple Silicon Mac Software Testing"},
    {"id": "PLFbqxkNlqrHNK0i4WN99Jc8g-qSbKoZEy", "name": "Andrew Tsai - M1 Apple Silicon Game Benchmarks"},
    {"id": "PLYzT4cEhhFvg5BPfy5-cOUNq7PtqzPr5s", "name": "Andrew Tsai - Source Ports M1 Mac"},
    {"id": "PLYzT4cEhhFvh9IAsuic4paA_elCqNKs3J", "name": "Andrew Tsai - Emulators M1 Mac"},
    {"id": "PLo11Rczpzuj05que94HF80LWD217ToJht", "name": "Max Tech - Apple Silicon Macs Explained"},
    {"id": "PL9H5Z-IdZ8M0tUdSfS_rmdc8CRR_FD83e", "name": "MrMacRight - Gaming Performance Tests"},
    {"id": "PLcbQnQIwz6qSt-qsD3jCJaEw9fK8yXarA", "name": "Created Labs - New 2020 M1 MacBook"},
    {"id": "PLRYMmqUFQ_cfETgJ_9tSHT1eD8c94y-qg", "name": "DaVinci Resolve + Apple M1 Tests - Learn Color Grading"},
    {"id": "PL3XJJi5sAjD1sCicSKd0irf5TnQ1KJvPm", "name": "Apple Silicon Macs — M1 & Beyond! - Rene Ritchie"},
    {"id": "PL3XJJi5sAjD1U4yadF-wNFS-k34L11jqp", "name": "M1 Pro / Max — High-Performance Macs! - Rene Ritchie"},
    {"id": "PL3XJJi5sAjD3IOyW5k_CObxQse3JlPI4A", "name": "Apple Silicon Deep Dives — A15 to M1 Pro & Max! - Rene Ritchie"},
    {"id": "PL3XJJi5sAjD3kMEU_xUQLRHAt4_2r3UtF", "name": "Apple Silicon Macs — M1, Pro, & Max! - Rene Ritchie"},
    {"id": "PLgz-h_Uy9AwOctqRcm6hEYEqTO9yIawoO", "name": "Apple M1 Silicon Benchmarks - Tonyisgaming"},
    {"id": "PLFf7t8YdWQOgVmQdiEey2c_7ygDeZGBvf", "name": "M1 - Jerry Schulze"},
    {"id": "PLEi3_qsqIyclc-3NqbEYlIvXEdcLXy1qX", "name": "Apple Silicon - DevChannel"},
    {"id": "PLsT75DpPtn2N0RvXGdkjnwAYM0m9EMpb7", "name": "Michael P. Schmidt"},
    {"id": "PL_9qmWdi19yCOCzAdTfFxpZtXonyfWTYJ", "name": "Ben G. Kaiser"},
    {"id": "PLQncOO7KICBIH-1Jv3fhOOU9b3-j6XoED", "name": "Constant Geekery"},
    {"id": "PLPwbI_iIX3aR88msMh-cHoJiBqS6YMUUH", "name": "Alexander Ziskind"},
    {"id": "PL6tu16kXT9Pqwg2H8G3mROh5g7LISl8wT", "name": "Execute Automation"},
    {"id": "PLlQPaN85gB1kRnc8RUnV-TEOXU_2iap8S", "name": "Portland CNC"},
    {"id": "PLQgB1FZhNI7XAf9-2Gb88o6MxxbqDQIgj", "name": "Ben Designs"},
    {"id": "PLvswiYwf1PZR_V1cXgKu0fKqN690LXRal", "name": "Ben Aqua"},
    {"id": "PL9Y8hNm43poLPdLAfFikiO_c4ZvpB4Wi8", "name": "Tech Gear Talk"},
    {"id": "PLmEmhiFYCJygSGcPGNRgiJ9T1AKxJjERI", "name": "c0pist"},
    {"id": "PLj__zPOcS7bkamYx2oe9p6YOn-63Imexd", "name": "BilValentine"},
    {"id": "PLprAMxVeEzkb4-19ncZ6GNWWL4QMxZIQK", "name": "Techkhamun"},
    {"id": "PLXHx58X9BZxJfSmttXQJv1zmNi0f7ANhq", "name": "iCave"},
    {"id": "PLugJ1ygKKMlI4WwyCbdLJOOHUZkFwvYbK", "name": "Douglas Hewitt"},
    {"id": "PLWrpcd0vRa5StCaJoGqT4NsmvOPjF-VZu", "name": "Painfully Honest Tech"},
    {"id": "PLzbToXWOz_ZiL5rUDKGaTQS5-eeWfMq7T", "name": "IrixGuy"},
    {"id": "PLPPMLgyyaMusoENI6yomC6DsYUymf2ey5", "name": "sand0m1ze gaming"},
    {"id": "PLtOOsLeNlKexKL9yzwp7vpbXaaynmfuQb", "name": "The Dev"},
    {"id": "PL_CkpxkuPiT9eGORxdWVWn0J58AUki_0W", "name": "Luke Barousse - Data Science"},
    {"id": "PL2xBqm1csOKoBkzu4GCnlHe_KiTGjzlNL", "name": "AudioMap"},
    {"id": "PL_NaeOyKxj28b_iVaiXfsyPaKwVeht-mG", "name": "Mark Payne"},
    {"id": "PLil8shFjsBGaDDxkXhXPYa937D3LcMJDx", "name": "White Sea Studio"},
    {"id": "PLy7gjSbRTE7M8QuYN6Uxp81whm2gAfwK9", "name": "Pete Herro"},
    {"id": "PLv-goqr3JHiT1_th-4G7KYt2ANT_nhN14", "name": "ProgramHub - M1 Pro / M1 Max Apple Silicon"},
    {"id": "PLv-goqr3JHiRlly49iSp69J-0eEeIBEXu", "name": "ProgramHub - MacBook M2"},
    {"id": "PLaa9cZC07ZPFqjoYLZRR3kbbnJRHhlmXq", "name": "My Personal Benchmarks Playlist", "tags": ["benchmark"]},
    {"id": "PLaa9cZC07ZPGM1f6A3F72qXNtPbVLl4V7", "name": "My Personal Playlist (For odds and ends)"},
]

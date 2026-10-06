# True-Fi Desktop compatibility on Apple Silicon

Approved status: Reported not working on Apple Silicon; discontinued.

The strongest compatibility evidence is a named contributor's February 28,
2021 report that the Mac audio driver cannot load. Discontinuation is separate
from compatibility, and does not justify omitting a useful historical listing.
Read the source report before treating SoundID or Reference tests as True-Fi tests.

## Scope and recommendation

Research date: October 6, 2026. Scope: Sonarworks True-Fi Desktop on Apple
Silicon, not True-Fi Mobile, SoundID Listen, or Reference 4.

Use this headline, which fits the repository's 80-code-point budget:

> 🚫 Reported not working on Apple Silicon; discontinued

Details: A contributor reported that True-Fi Desktop's audio driver would not
load on Apple Silicon, preventing headphone correction. The report is historical,
has no exact True-Fi version or screenshot, and has not been independently
reproduced in this review. No later True-Fi-specific successful Apple Silicon
test or workaround was found in the searches conducted.

## Evidence

- [HenkPoley's February 28, 2021 compatibility report](https://github.com/ThatGuySam/doesitarm/issues/374#issuecomment-787469133)
  explicitly separates True-Fi Desktop driver failure from True-Fi Mobile,
  SoundID Listen, and Reference 4. The reporter says the iOS app could still run
  on Big Sur 11.2.2, but this does not establish that the Mac desktop driver works.
- [Sonarworks' old discontinuation FAQ](https://www.sonarworks.com/truefi)
  states discontinuation from March 2, 2020 and no future updates. Search's cached
  copy was retrievable. Direct retrieval failed with a redirect loop or timeout,
  so this is not recommended as a dependable listing link today.
- [MuseMuff's March 5, 2020 community discussion](https://forum.headphones.com/t/sonarworks-reference-true-fi/2278/50)
  records the termination of True-Fi and the distinction from SoundID and
  Reference. This supports lifecycle context, not Apple Silicon compatibility.
- [MacRumors discussion from December 2020](https://forums.macrumors.com/threads/airpods-max-is-here-first-impressions-and-photos-thread.2275433/page-11)
  distinguishes discontinued True-Fi from a working Reference 4 beta. It does
  not supply a True-Fi Desktop success report.

Searches covered GitHub issues, Hacker News, Reddit's headphones community,
Head-Fi, the Headphone Community, and MacRumors. Most results concerned other
Sonarworks products or pre-Apple-Silicon listening impressions. No independent
community consensus about current True-Fi Desktop compatibility was established.

## Listing links

1. [Compatibility report](https://github.com/ThatGuySam/doesitarm/issues/374#issuecomment-787469133).
2. [Discontinuation discussion](https://forum.headphones.com/t/sonarworks-reference-true-fi/2278/50).

The README now records the approved status and both evidence links for
`/app/true-fi`. Close issue 374 as a completed listing request only after the
deployed page shows the correction. Completion means the compatibility result
is documented; it does not imply a software fix.

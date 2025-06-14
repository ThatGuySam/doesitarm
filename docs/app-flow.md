# App Request Flow

Flow for new app requests and updates to existing apps

<!-- 
Mermaid Diagram Notes:
- All node labels MUST be wrapped in quotes ("text") when containing:
  * Special characters like parentheses ()
  * HTML tags like <br/>
  * Single quotes within text 'text'
  * Emojis combined with special characters
- Without quotes, Mermaid throws parsing errors like "Expecting 'SQE'..."
- Do NOT wrap the entire code block in quotes - breaks markdown rendering
-->

```mermaid
flowchart TD
    A["1A. 👤 User: Submits App Request or Issue<br/>(via '🙋 Request an App with Github' from doesitarm.com OR directly to GitHub repo)"] --> B["2A. 👤 User: Check for Existing Issue<br/>(Search query page from doesitarm.com)"]
    B -- Not Found --> C["3A. 👤 User: Fill Out Issue Form<br/>(App Name, Status, Category, Links, Screenshot)"]
    C --> D["4A. ⚙️ System: Label as 'New App Request'"]
    D --> E["5A. 🔧 Maintainer: Type of Issue?"]
    E -- New App Request --> F["6A. 🔧 Maintainer: Reviews Submission"]
    F -- Info Complete --> F2["7A. 🔧 Maintainer: Comment Thank You"]
    F2 --> F3["8A. 🔧 Maintainer: Explain Options<br/>(User can make PR or Does It ARM bot will try to add automatically)"]
    F3 --> G["9A. 🔧 Maintainer: Label as 'Ready to Add'"]
    F -- Info Missing --> H0["6B. 🔧 Maintainer: Thank User for Info Provided"]
    H0 --> H["7B. 🔧 Maintainer: Request More Info from User"]
    H --> H2["8B. 🔧 Maintainer: Add 'Needs ...' Labels<br/>(e.g. Needs Screenshots, Needs Category)"]
    H2 --> F
    
    G --> I["10A. 👥 Contributor: Creates PR"]
    G --> I2["10B. 🔧 Maintainer: Updates README Directly"]
    I --> J["11A. 👥 Contributor: App Added to Compatibility List"]
    I2 --> I3["11B. 🔧 Maintainer: Verify App Updated on doesitarm.com<br/>(can take up to 15 mins)"]
    J --> J1["12A. 🔧 Maintainer: Review PR"]
    J1 --> J2["13A. 🔧 Maintainer: Thank Contributor for PR"]
    J2 --> J3["14A. 🔧 Maintainer: PR Decision"]
    J3 -- Changes Requested --> J4["15A. 🔧 Maintainer: Request PR Changes"]
    J4 --> J5["16A. 👥 Contributor: Update PR"]
    J5 --> J1
    J3 -- Approved --> L1["17A. 🔧 Maintainer: Comment that App is Live"]
    I3 --> L1
    L1 --> K["18A. ⚙️ System: Close Issue"]

    E -- App Update --> L["1C. 👤 User: Reports Update<br/>(e.g. Native Support Now Available)"]
    L --> M["2C. 👤 User: Provide Evidence<br/>(Links, Screenshots)"]
    M --> N["3C. ⚙️ System: Label as 'App Update'<br/>(Auto-applied via App Update Template)"]
    N --> F

    E -- Feature/Meta Issue --> O["1D. 🔧 Maintainer: Label as 'Feature Request' or 'Bug'"]
    O --> P["2D. 🔧 Maintainer: Discuss, Assign, and Track Progress"]
    P --> Q["3D. 👥 Contributor: Implement and Close"]

    style A stroke:#f9f,stroke-width:2px
    style J stroke:#bbf,stroke-width:2px
    style K stroke:#bfb,stroke-width:2px
```

# Water Sim Scene

[**Remix on AI Studio**](https://ai.studio/apps/drive/1WYqqbd5DDER7bue4-jyHmwA6AC6Fn65w?fullscreenApplet=true)

This is a real-time WebGL water simulation ported to Three.js, built with a modern, theme-aware React design system.

## Project Scan Sheet

| Category | Details |
| :--- | :--- |
| **Framework** | React 19.0.0 (Vite + ESM via `importmap`) |
| **3D Library** | Three.js 0.182.0 |
| **Styling** | CSS-in-JS (JS Objects), Semantic Design Tokens, No CSS Modules/Tailwind |
| **Animation** | Framer Motion 12.x (Spring Physics, Layout Animations) |
| **Typography** | Bebas Neue (Display), Comic Neue (Quotes), Inter (UI), Victor Mono (Code) |
| **Icons** | Phosphor Icons (Web Component) |
| **State Management** | React Context (`Theme`, `Breakpoint`), Local State, History Stack (Undo/Redo) |
| **Architecture** | Atomic-based: `Core` → `Package` → `Section` → `Page` → `App` |
| **Key Components** | Floating Windows, Draggable Dock, WebGL Water Simulation |
| **Theme System** | Light/Dark Modes, Responsive Tokens, Feedback States (Success, Warning, Error, Signal) |
| **Inputs** | Range Sliders, Color Pickers, Toggles, Selects, TextAreas |

## What's Inside? (ELI10 Version)

Imagine you're building with LEGOs. This project gives you a super organized box of special LEGO pieces to build an amazing app. The main stage is a beautiful, interactive water simulation!

-   **`index.html`**: The front door to our app.
-   **`index.tsx`**: The main brain of the app.
-   **`importmap.js`**: A map that tells our app where to find its tools (like React & Three.js).
-   **`Theme.tsx`**: The "master closet" for our app's style (colors, fonts, etc.).
-   **`hooks/`**: Special tools (custom hooks).
-   **`types/`**: A dictionary for our app's data shapes.
-   **`components/`**: The LEGO pieces themselves, organized by complexity!
    -   **`Core/`**: Basic, single-purpose pieces (Button, Input, Toggle, etc.).
    -   **`Package/`**: Combines Core pieces into something more useful (`ControlPanel`, `FloatingWindow`).
    -   **`WebGL/`**: Specialized pieces for our water simulation engine.
    -   **`Section/`**: Larger sections of the app (the `Dock`, the main `Stage`).
    -   **`Page/`**: Full screen layouts (`Welcome` page).
-   **`README.md`**: This file! Your friendly guide.
-   **`LLM.md`**: Instructions for AI helpers.
-   **`noteBook.md`**: A diary of tasks and progress.
-   **`bugReport.md`**: A list of bugs to fix.

## Directory Tree

```
.
├── components/
│   ├── App/
│   │   └── MetaPrototype.tsx
│   ├── Core/
│   │   ├── Button.tsx
│   │   ├── ColorPicker.tsx
│   │   ├── Confetti.tsx
│   │   ├── DockIcon.tsx
│   │   ├── Input.tsx
│   │   ├── LogEntry.tsx
│   │   ├── RangeSlider.tsx
│   │   ├── Select.tsx
│   │   ├── StateLayer.tsx
│   │   ├── TextArea.tsx
│   │   ├── ThemeToggleButton.tsx
│   │   └── Toggle.tsx
│   ├── Package/
│   │   ├── CodePanel.tsx
│   │   ├── ConsolePanel.tsx
│   │   ├── ControlPanel.tsx
│   │   ├── FloatingWindow.tsx
│   │   ├── UndoRedo.tsx
│   │   └── WebGLWater.tsx
│   ├── Page/
│   │   └── Welcome.tsx
│   ├── Section/
│   │   ├── Dock.tsx
│   │   └── Stage.tsx
│   └── WebGL/
│       ├── WaterEngine.ts
│       ├── GPGPUWater.ts
│       ├── CausticsGenerator.ts
│       ├── shaders.ts
│       └── assets.ts
├── hooks/
│   ├── useBreakpoint.tsx
│   └── useElementAnatomy.tsx
├── types/
│   └── index.tsx
├── README.md
├── LLM.md
├── noteBook.md
├── bugReport.md
├── Theme.tsx
├── importmap.js
├── index.html
├── index.tsx
├── metadata.json
└── package.json
```

## How to Get Started

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
3.  Open the provided URL in your browser.
4.  Start changing the code in the `.tsx` files to build your own features.

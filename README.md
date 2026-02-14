# React 18 Meta Prototype & Design System Starter Kit

[**Remix on AI Studio**](https://ai.studio/apps/drive/1WYqqbd5DDER7bue4-jyHmwA6AC6Fn65w?fullscreenApplet=true)

This is a starter project for building modern, theme-aware React applications. It is now being adapted to house a real-time WebGL water simulation ported to Three.js.

## Project Scan Sheet

| Category | Details |
| :--- | :--- |
| **Framework** | React 18.2.0 (ESM via `importmap`) |
| **3D Library** | Three.js 0.180.0 |
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

Imagine you're building with LEGOs. This project gives you a super organized box of special LEGO pieces to build an amazing app. The main stage is now a beautiful, interactive water simulation!

-   **`index.html`**: The front door to our app.
-   **`index.tsx`**: The main brain of the app.
-   **`importmap.js`**: A map that tells our app where to find its tools (like React & Three.js).
-   **`Theme.tsx`**: The "master closet" for our app's style (colors, fonts, etc.).
-   **`hooks/`**: Special tools (custom hooks).
    -   `useBreakpoint.tsx`: Checks if you're on a phone, tablet, or desktop.
-   **`types/`**: A dictionary for our app's data shapes.
    -   `index.tsx`: Defines what a "Window" or a "Log Entry" looks like.
-   **`components/`**: The LEGO pieces themselves, organized by complexity!
    -   **`Core/`**: The most basic, single-purpose pieces (Button, Input, Toggle, etc.).
    -   **`Package/`**: Combines Core pieces into something more useful (`ControlPanel`, `FloatingWindow`, `WebGLWater`).
    -   **`Section/`**: A whole section of the app (the `Dock` at the bottom, the main `Stage`).
    -   **`Page/`**: A full screen you see (`Welcome` page).
    -   **`App/`**: The complete, running application (`MetaPrototype`).
-   **`README.md`**: This file! Your friendly guide.
-   **`LLM.md`**: Special instructions for AI helpers.
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
│   └── Section/
│       ├── Dock.tsx
│       └── Stage.tsx
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
```

## How to Get Started

1.  Open the `index.html` file in a modern web browser.
2.  That's it! The app will run.
3.  Start changing the code in the `.tsx` files to build your own features.

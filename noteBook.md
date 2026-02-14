# Developer Notebook

A log of all tasks, ideas, and progress for this project.

## To Do

-   [ ] Port the raytraced reflection/refraction shaders to `ShaderMaterial`.
-   [ ] Implement the caustics generation pass.
-   [ ] Connect the `ControlPanel` to the live simulation parameters (e.g., toggle sphere physics).
-   [ ] Add raycasting for moving the sphere.
-   [ ] Add underwater scene.

## In Progress

-   **[2024-05-22 10:30]**: Implemented the core GPU water simulation using a render-to-texture ping-pong system. The static pool floor is now a dynamic water mesh displaced by the simulation. Added raycasting for interactive ripples.
-   **[2024-05-22 10:15]**: Set up the main Three.js scene, replacing the placeholder cube with the pool, sphere, and skybox from the original demo. Implemented OrbitControls for camera interaction.
-   **[2024-05-22 10:00]**: Began porting WebGL Water demo to Three.js and React. Created initial `WebGLWater` component with a basic scene and integrated it into the main `Stage`.

## Done

-   **[2024-05-24 09:00]**: Replaced light azimuth/elevation controls with direct XYZ position sliders for more intuitive directional light control. Added a specular intensity slider to control highlight brightness on the water surface.
-   **[2024-05-23 11:15]**: Fixed water rendering artifact at grazing angles by toning down the specular highlight calculation to prevent color clipping.
-   **[2024-05-21 13:15]**: Added a toggleable measurement overlay to the Stage, showing real-time dimensions for the button component.
-   **[2024-05-21 13:00]**: Completed extensive refactor into granular components (new Core inputs, Package panels for each window, Section for Stage).
-   **[2024-05-21 12:30]**: Refactored MetaPrototype into a modular component structure (App, Package, Section, Core) for better organization and scalability.
-   **[2024-05-21 12:00]**: Implemented Meta Prototype environment with draggable windows and State Layer physics.
-   **[2024-05-21 10:30]**: Implemented Tier 3 documentation files (`README.md`, `LLM.md`, `noteBook.md`, `bugReport.md`) as per system prompt.
-   **[2024-05-21 09:00]**: Initial project setup with React, Theme Provider, and responsive breakpoints.
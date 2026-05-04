# rendering (delta)

## ADDED Requirements

### Requirement: Three.js scene foundation

The system SHALL render a Three.js scene with a perspective camera, ambient and directional lighting, a ground plane, and a sky color distinct from the ground.

#### Scenario: Scene renders on load

- WHEN the page is loaded
- THEN a non-empty WebGL canvas SHALL be visible at the `#app` mount point
- AND the ground plane SHALL be visible from the default camera position
- AND the sky SHALL be a solid clear color visually distinct from the ground

### Requirement: Frame rate counter

The system SHALL display the current render frame rate in a DOM overlay, updated at least once per second.

#### Scenario: FPS counter visible after load

- WHEN the page has been loaded for at least 1 second
- THEN a DOM element SHALL be present whose text content matches the regex `/FPS:\s*\d+/`

### Requirement: Render decoupled from physics

The renderer SHALL render once per `requestAnimationFrame` callback and SHALL NOT step the physics world. Physics state SHALL be read from the simulation core only.

#### Scenario: Renderer never advances physics

- GIVEN the renderer is running
- WHEN a render frame occurs
- THEN no call to `world.step` SHALL originate from the render module

### Requirement: Smoke test

The system SHALL pass a Playwright smoke test asserting the page loads and the displayed FPS exceeds 30 after 5 seconds.

#### Scenario: Smoke test passes

- WHEN the smoke test loads the dev or built page
- THEN within 5 seconds, the FPS overlay text SHALL parse to a number > 30
- AND no console errors SHALL be emitted during load

### Requirement: Window resize

The renderer SHALL update camera aspect ratio and renderer size on `window.resize`.

#### Scenario: Canvas reflows on resize

- WHEN the browser window is resized
- THEN the WebGL canvas SHALL match the new viewport dimensions
- AND the perspective camera aspect SHALL be updated to match

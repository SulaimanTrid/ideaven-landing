/**
 * Learn (roadmap 27): real lessons about the actual editor — every step
 * described here exists in the product today. Kept as data so lessons are
 * trivially extensible and statically renderable.
 */

export interface LessonSection {
  heading: string;
  paragraphs: string[];
  tips?: string[];
}

export interface Lesson {
  slug: string;
  kicker: string;
  title: string;
  minutes: number;
  summary: string;
  sections: LessonSection[];
}

export const LESSONS: Lesson[] = [
  {
    slug: "your-first-screen",
    kicker: "Design",
    title: "Build your first screen",
    minutes: 5,
    summary: "Drag real components onto the canvas, nest them, and style them — the canvas is the project, not a mock.",
    sections: [
      {
        heading: "Open the builder",
        paragraphs: [
          "Create a project from the dashboard (blank or from a template) and you land in the builder. The left rail lists your screens; the center is a live device-framed canvas of the selected screen; the right side is the properties inspector.",
        ],
      },
      {
        heading: "Add and arrange components",
        paragraphs: [
          "Pick a component from the palette — column, row, card, text, button, inputs, image, icon, and more — and click or drag it onto the canvas. Drop it onto an existing container to nest it; the drop indicator shows exactly where it will land.",
          "Reorder by dragging nodes in the layer tree or on the canvas itself. Duplicate and delete live in each node's context actions.",
        ],
        tips: [
          "Containers (column, row, card) are the only components that accept children — build layout by nesting them.",
          "Everything you draw mutates the canonical project model directly. There is no separate 'design document'.",
        ],
      },
      {
        heading: "Style with the inspector",
        paragraphs: [
          "Select any node and the inspector shows its real properties and styles: text content, placeholder, colors, padding, radius, gap, alignment, and size. Changes apply immediately and autosave (1.5s debounce) to the server.",
        ],
      },
    ],
  },
  {
    slug: "blocks-and-logic",
    kicker: "Blocks",
    title: "Make it come alive with blocks",
    minutes: 8,
    summary: "Events plus a stack of blocks: navigate screens, set properties, show messages, and branch with if/else.",
    sections: [
      {
        heading: "Events and handlers",
        paragraphs: [
          "Switch to Blocks mode. Each component can react to events — click, change, and enter (for inputs). Pick a component, add an event, and you get an empty handler: a stack waiting for blocks.",
        ],
      },
      {
        heading: "The block vocabulary",
        paragraphs: [
          "Statements do things: set a component property, set a variable, show a message toast, navigate to a screen, and if/else with a condition slot. Expressions fill slots: text, number, get-property, get-variable, join, and equals.",
          "Drag blocks into the stack and drop expressions into their slots. An if block carries both a then and an else body — branch on anything you can express with equals.",
        ],
        tips: [
          "'set variable score to 10' needs a variable — create one in the Variables panel first.",
          "Navigation blocks validate their target: the diagnostics panel flags a navigate to a deleted screen.",
        ],
      },
      {
        heading: "Blocks are the program",
        paragraphs: [
          "The block tree is stored in the model as structured data — the same tree Code mode renders as TypeScript and the runtime executes. Design, Blocks, and Code are three views of one program, never three copies.",
        ],
      },
    ],
  },
  {
    slug: "from-blocks-to-code",
    kicker: "Code",
    title: "From blocks to code — and back",
    minutes: 6,
    summary: "Code mode shows the real TypeScript your blocks generate. Edit it by hand and Ideaven converts it back into blocks.",
    sections: [
      {
        heading: "Generated, editable TypeScript",
        paragraphs: [
          "Open Code mode and you see the screen's logic as TypeScript against the ScreenApi: api.onComponent(...), api.navigate(...), api.setProperty(...), api.setVariable(...). It is not a preview — it is a real Monaco editor with parse diagnostics and error markers.",
        ],
      },
      {
        heading: "The round trip",
        paragraphs: [
          "Edit the code within the supported subset and Ideaven converts it back into blocks — the reverse direction runs through the same pipeline the generator does, with a block-to-line source map so diagnostics point at the right block.",
          "Anything outside the subset is stored as the screen's custom code, kept intact and never overwritten by generation. The Diagnostics panel shows the difference: block-backed logic and custom code are labeled.",
        ],
        tips: [
          "Click a diagnostic to jump to its source — Blocks mode for block issues, Code mode for parse errors.",
          "'No errors 🎉' in the Diagnostics panel is a live state, not decoration.",
        ],
      },
    ],
  },
  {
    slug: "preview-and-test",
    kicker: "Preview",
    title: "Preview and test your build",
    minutes: 4,
    summary: "Preview executes the same block IR the editor edits — buttons click, inputs type, navigation navigates.",
    sections: [
      {
        heading: "A real runtime, not a mockup",
        paragraphs: [
          "Preview mode boots the runtime with your variables and component state, starting at the model's start screen. Every interaction runs the actual handlers: toasts appear, properties change, screens swap.",
        ],
      },
      {
        heading: "Iterate fast",
        paragraphs: [
          "Switch device frames to test phone, tablet, and desktop layouts. Jump between screens to simulate navigation, and use Restart run to reset state for a clean test.",
          "Edits in Design or Blocks are reflected the moment you return to Preview — the runtime always re-seeds from the saved model.",
        ],
      },
    ],
  },
  {
    slug: "publish-and-share",
    kicker: "Publish",
    title: "Publish, share, and remix",
    minutes: 5,
    summary: "Publishing snapshots your project to a public page at /p/your-slug. Visitors run the real app — and can remix it.",
    sections: [
      {
        heading: "Publish a snapshot",
        paragraphs: [
          "Hit Publish in the builder. Ideaven saves your latest model first, then stores a server-side snapshot and flips the project to published. Your page goes live at /p/<slug> with your name on it.",
          "Editing after publishing never changes the live page — visitors see the snapshot until you press Republish latest. Unpublish removes the public page immediately and returns the project to draft.",
        ],
      },
      {
        heading: "The community loop",
        paragraphs: [
          "Published projects appear in Explore and Community. A visitor can remix any project into their own account as a fresh draft — the copy credits the original creator in its description.",
          "Your creator page (/creators/<username>) lists everything you have published.",
        ],
        tips: [
          "Assets you upload render on the public page only while the project is published — private stays private.",
          "The project's description on the public page comes from the project description; a line here sells the project.",
        ],
      },
    ],
  },
  {
    slug: "export-everywhere",
    kicker: "Export",
    title: "Export to HTML and Android",
    minutes: 6,
    summary: "One vanilla-JS runtime, two targets: a single-file web export and a ready-to-build Android project.",
    sections: [
      {
        heading: "Standalone HTML",
        paragraphs: [
          "The builder's Export button downloads a single .html file: your model, a small runtime that interprets it, and nothing else. Open it anywhere — it runs offline, executes blocks, navigates screens, and shows toasts.",
          "Images bound to stored project assets resolve through your Ideaven server while the project stays published; external image URLs always work.",
        ],
      },
      {
        heading: "The Android project",
        paragraphs: [
          "The second download is a complete Android WebView project: Kotlin activity, Gradle build files, and your export as assets/index.html. Open it in Android Studio and run, or build on the command line with an SDK.",
          "No SDK on this machine? The project includes a GitHub Actions workflow that builds a debug APK on every push — the artifact is the APK, no local tooling required.",
        ],
        tips: [
          "The exported app runs the same block IR as Preview — what you tested is what ships.",
          "Custom code (anything outside the block subset) executes too: the runtime implements the ScreenApi calls the codegen emits.",
        ],
      },
    ],
  },
];

export function lessonBySlug(slug: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.slug === slug);
}

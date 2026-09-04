# UI components

The application uses Cult UI's source-copy model, not a monolithic `cult-ui` runtime package. Upstream: https://github.com/nolly-studio/cult-ui (MIT; copied license in `apps/web/components/ui/LICENSE.md`).

Popover, command, dialog, select, checkbox, tooltip, input, button and table primitives come from Cult UI's `apps/www/components/ui` source. Local compositions use those primitives for searchable single/multiple model pickers, disclosures and accessible chart hints. TextureButton, MinimalCard and DirectionAwareTabs retain the existing application APIs with project-token styling and Radix Slot/Motion behavior; they are adapters of the Cult patterns. This is a token-adapted component system, not an unchanged copy of Cult's demo pages.

Use these components for new controls. Native HTML remains appropriate for semantic headings, tables and links. Do not add native select, datalist or dialog controls. Both themes use the same project tokens; overlays render through portals and support keyboard focus and Escape.

Corporate marks are static SVGs rendered from the Lobe Icons MIT collection; the Thinking Machines favicon comes from its official website. Attribution: `apps/web/public/logos/LICENSE`. Marks identify the organizations in data and do not imply endorsement.

export type OutputFormat = 'svg' | 'png';

export interface DiagramFormat {
  /** Canonical id, also the Kroki diagram type. */
  id: string;
  aliases: readonly string[];
  /** Outputs Kroki can produce for this format. */
  outputs: readonly OutputFormat[];
  description: string;
  docsUrl: string;
  /** A minimal diagram that renders without errors. */
  example: string;
}

// Output support checked against https://kroki.io/#support.
export const FORMATS = [
  {
    id: 'mermaid',
    aliases: [],
    outputs: ['svg', 'png'],
    description: 'Flowcharts, sequence, class, state, ER, Gantt and other diagrams in Markdown-like syntax.',
    docsUrl: 'https://mermaid.js.org/intro/syntax-reference.html',
    example: 'flowchart LR\n  A[Client] --> B[API]\n  B --> C[(Database)]\n',
  },
  {
    id: 'plantuml',
    aliases: [],
    outputs: ['svg', 'png'],
    description: 'UML diagrams (sequence, class, component, activity, state, deployment) and more.',
    docsUrl: 'https://plantuml.com/',
    example: '@startuml\nAlice -> Bob: Request\nBob --> Alice: Response\n@enduml\n',
  },
  {
    id: 'c4plantuml',
    aliases: [],
    outputs: ['svg', 'png'],
    description: 'C4 model architecture diagrams (context, container, component) on top of PlantUML.',
    docsUrl: 'https://github.com/plantuml-stdlib/C4-PlantUML',
    example:
      '@startuml\n!include <C4/C4_Context>\nPerson(user, "User")\nSystem(app, "Web App")\nRel(user, app, "Uses")\n@enduml\n',
  },
  {
    id: 'graphviz',
    aliases: ['dot'],
    outputs: ['svg', 'png'],
    description: 'Graphs and networks in the Graphviz DOT language.',
    docsUrl: 'https://graphviz.org/doc/info/lang.html',
    example: 'digraph G {\n  rankdir=LR;\n  client -> api -> db;\n}\n',
  },
  {
    id: 'd2',
    aliases: [],
    outputs: ['svg'],
    description: 'Declarative diagrams with automatic layout, well suited to software architecture.',
    docsUrl: 'https://d2lang.com/tour/intro',
    example: 'client -> api: HTTPS\napi -> db: SQL\ndb: {shape: cylinder}\n',
  },
  {
    id: 'structurizr',
    aliases: [],
    outputs: ['svg', 'png'],
    description: 'C4 model workspaces in the Structurizr DSL (model plus views).',
    docsUrl: 'https://docs.structurizr.com/dsl/language',
    example:
      'workspace {\n  model {\n    user = person "User"\n    app = softwareSystem "App"\n    user -> app "Uses"\n  }\n  views {\n    systemContext app {\n      include *\n      autolayout lr\n    }\n  }\n}\n',
  },
  {
    id: 'bpmn',
    aliases: [],
    outputs: ['svg'],
    description: 'Business process diagrams in BPMN 2.0 XML (including diagram interchange coordinates).',
    docsUrl: 'https://www.omg.org/spec/BPMN/2.0/',
    example:
      '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="defs" targetNamespace="http://bpmn.io/schema/bpmn">\n  <bpmn:process id="process" isExecutable="false">\n    <bpmn:startEvent id="start"><bpmn:outgoing>flow</bpmn:outgoing></bpmn:startEvent>\n    <bpmn:endEvent id="end"><bpmn:incoming>flow</bpmn:incoming></bpmn:endEvent>\n    <bpmn:sequenceFlow id="flow" sourceRef="start" targetRef="end" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id="diagram">\n    <bpmndi:BPMNPlane id="plane" bpmnElement="process">\n      <bpmndi:BPMNShape id="start_di" bpmnElement="start"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id="end_di" bpmnElement="end"><dc:Bounds x="250" y="100" width="36" height="36" /></bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id="flow_di" bpmnElement="flow"><di:waypoint x="136" y="118" /><di:waypoint x="250" y="118" /></bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n',
  },
  {
    id: 'excalidraw',
    aliases: [],
    outputs: ['svg'],
    description: 'Hand-drawn style sketches from an Excalidraw JSON scene.',
    docsUrl: 'https://docs.excalidraw.com/docs/codebase/json-schema',
    example:
      '{\n  "type": "excalidraw",\n  "version": 2,\n  "source": "https://excalidraw.com",\n  "elements": [\n    {\n      "id": "box",\n      "type": "rectangle",\n      "x": 0,\n      "y": 0,\n      "width": 160,\n      "height": 80,\n      "angle": 0,\n      "strokeColor": "#1e1e1e",\n      "backgroundColor": "transparent",\n      "fillStyle": "solid",\n      "strokeWidth": 2,\n      "strokeStyle": "solid",\n      "roughness": 1,\n      "opacity": 100,\n      "groupIds": [],\n      "seed": 1,\n      "version": 1,\n      "versionNonce": 1,\n      "isDeleted": false,\n      "boundElements": null,\n      "updated": 1,\n      "link": null,\n      "locked": false\n    }\n  ],\n  "appState": { "viewBackgroundColor": "#ffffff" },\n  "files": {}\n}\n',
  },
] as const satisfies readonly DiagramFormat[];

export type FormatId = (typeof FORMATS)[number]['id'];

/** Every accepted `format` value: canonical ids followed by aliases. */
export const FORMAT_NAMES = [...FORMATS.map((f) => f.id), ...FORMATS.flatMap((f) => f.aliases)] as [
  string,
  ...string[],
];

const byName = new Map<string, DiagramFormat>();
for (const format of FORMATS) {
  byName.set(format.id, format);
  for (const alias of format.aliases) byName.set(alias, format);
}

/** Resolves an id or alias (case-insensitive) to its format, or undefined. */
export function resolveFormat(name: string): DiagramFormat | undefined {
  return byName.get(name.trim().toLowerCase());
}

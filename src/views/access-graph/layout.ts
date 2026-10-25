import ELK from 'elkjs/lib/elk.bundled.js'
import type { AccessGraph } from './elements'

/**
 * Positions for the graph's nodes, from elkjs's layered layout, left to right. Each node keeps to
 * its column (partitioning), so role holders line up even when some have group members and some
 * don't. The bundled build runs on the main thread: no worker script to host or allow in the CSP.
 */

export const NODE_WIDTH = 240
export const NODE_HEIGHT = 64

const elk = new ELK()

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.partitioning.activate': 'true',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '24',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
}

export interface Position {
  readonly x: number
  readonly y: number
}

export async function layoutGraph(graph: AccessGraph): Promise<Map<string, Position>> {
  const result = await elk.layout({
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: { 'elk.partitioning.partition': String(node.column) },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  })
  return new Map(
    (result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  )
}

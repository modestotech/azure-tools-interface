import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type ColorMode,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import type { ViewProps } from '../types'
import { graphElements, type AccessGraph as Graph } from './elements'
import { layoutGraph, type Position } from './layout'
import { NodeCard, type FlowNode } from './NodeCard'
import { NodeDetails } from './NodeDetails'

const nodeTypes = { access: NodeCard }

/** The app's theme is a class on <html>; React Flow's colors follow it. */
const colorMode = (): ColorMode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

/** Positions for a graph, computed by elkjs off the render path. Stale ones stay until it's done. */
function useLayout(graph: Graph) {
  const [layout, setLayout] = useState<{ graph: Graph; positions: Map<string, Position> }>()
  useEffect(() => {
    let current = true
    void layoutGraph(graph).then((positions) => {
      if (current) setLayout({ graph, positions })
    })
    return () => {
      current = false
    }
  }, [graph])
  return { positions: layout?.positions, laidOut: layout?.graph === graph }
}

const INEFFECTIVE = { className: 'opacity-40', style: { strokeDasharray: '4 4' } }

function toFlowEdge(edge: Graph['edges'][number]): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    ...(edge.effective ? {} : INEFFECTIVE),
  }
}

/** principal / group member → operation → backend, laid out left to right by elkjs. */
export default function AccessGraph({ model }: ViewProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string>()
  const graph = useMemo(() => graphElements(model, expanded), [model, expanded])
  const { positions, laidOut } = useLayout(graph)

  const nodes = useMemo((): FlowNode[] => {
    const onToggleGroup = (groupId: string) => {
      setExpanded((previous) => {
        const next = new Set(previous)
        if (!next.delete(groupId)) next.add(groupId)
        return next
      })
    }
    return graph.nodes.map((node) => {
      const position = positions?.get(node.id)
      return {
        id: node.id,
        type: 'access',
        position: position ?? { x: 0, y: 0 },
        hidden: !position,
        selected: node.id === selectedId,
        data: { node, onToggleGroup },
      }
    })
  }, [graph, positions, selectedId])
  const edges = useMemo(() => graph.edges.map(toFlowEdge), [graph])
  const selected = graph.nodes.find((node) => node.id === selectedId)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {graph.nodes.length} nodes, {graph.edges.length} edges. Select a node for details; groups
        show their direct members on request. Dashed edges are memberships that give no access.
        {(model.pending.length > 0 || !laidOut) && ' · loading…'}
      </p>
      <div className="h-[60vh] rounded-md border" data-testid="access-graph">
        {positions ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={colorMode()}
            nodesConnectable={false}
            nodesDraggable={false}
            fitView
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              setSelectedId(node.id === selectedId ? undefined : node.id)
            }}
            onPaneClick={() => {
              setSelectedId(undefined)
            }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <p className="text-muted-foreground p-3 text-sm">Laying out the graph…</p>
        )}
      </div>
      {selected && <NodeDetails model={model} node={selected} />}
    </div>
  )
}

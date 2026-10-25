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
import { Input } from '@/components/ui/input'
import type { AccessModel } from '@/domain'
import type { ViewProps } from '../types'
import { graphElements, type AccessGraph as Graph } from './elements'
import { layoutGraph, type Position } from './layout'
import { NodeCard, type FlowNode } from './NodeCard'
import { NodeDetails } from './NodeDetails'

const nodeTypes = { access: NodeCard }

/**
 * The most edges drawn at once. elkjs lays out on the main thread and React Flow renders every
 * edge, so a large tenant's full graph (hundreds of thousands of grants) would freeze the page.
 * Past this, the view asks for a narrower operation filter instead.
 */
export const MAX_DRAWN_EDGES = 1500

/** Operations whose method, path or name contain the filter; undefined (all) when it's empty. */
function shownOperations(model: AccessModel, filter: string): Set<string> | undefined {
  const needle = filter.trim().toLowerCase()
  if (!needle) return undefined
  return new Set(
    model.operations
      .filter(({ operation }) =>
        [operation.method, operation.urlTemplate, operation.displayName].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )
      .map(({ operation }) => operation.id),
  )
}

/** The app's theme is a class on <html>; React Flow's colors follow it. */
const colorMode = (): ColorMode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

/**
 * Positions for a graph, computed by elkjs off the render path. Stale ones stay until it's done.
 * No graph (too large to draw) lays out nothing.
 */
function useLayout(graph: Graph | undefined) {
  const [layout, setLayout] = useState<{ graph: Graph; positions: Map<string, Position> }>()
  useEffect(() => {
    if (!graph) return
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
  const [filter, setFilter] = useState('')
  const shown = useMemo(() => shownOperations(model, filter), [model, filter])
  const graph = useMemo(() => graphElements(model, expanded, shown), [model, expanded, shown])
  const tooLarge = graph.edges.length > MAX_DRAWN_EDGES
  const { positions, laidOut } = useLayout(tooLarge ? undefined : graph)

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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filter operations"
          placeholder="Filter operations…"
          className="max-w-xs"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value)
          }}
        />
        <p className="text-muted-foreground text-sm">
          {graph.nodes.length} nodes, {graph.edges.length} edges. Select a node for details; groups
          show their direct members on request. Dashed edges are memberships that give no access.
          {(model.pending.length > 0 || (!tooLarge && !laidOut)) && ' · loading…'}
        </p>
      </div>
      <div className="h-[60vh] rounded-md border" data-testid="access-graph">
        {tooLarge ? (
          <p className="text-muted-foreground p-3 text-sm" role="status">
            {graph.edges.length} edges are too many to draw (the limit is {MAX_DRAWN_EDGES}). Filter
            the operations, or collapse groups, to draw a part of the graph. The Operations and
            Principals views show everything.
          </p>
        ) : positions ? (
          <ReactFlow
            // Remounted when the filter changes, so the view fits the new graph.
            key={filter}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={colorMode()}
            nodesConnectable={false}
            nodesDraggable={false}
            fitView
            minZoom={0.1}
            onlyRenderVisibleElements
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

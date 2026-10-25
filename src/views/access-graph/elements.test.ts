import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import { ORDERS_READERS } from '@/test/fixtures/graph'
import { graphElements, nodeTitle, principalNodeId } from './elements'
import { layoutGraph } from './layout'

const model = () => buildAccessModel(fixtureInputs())

describe('graphElements', () => {
  it('draws role holders, operations and backends, with groups collapsed', () => {
    const graph = graphElements(model(), new Set())
    expect(graph.nodes.map((node) => [node.column, nodeTitle(node)])).toEqual([
      [1, 'Contoso Webshop'],
      [1, 'Orders Readers'],
      [1, 'Bob Berg'],
      [2, 'GET /orders'],
      [2, 'POST /orders'],
      [3, 'Orders service'],
    ])
    const group = graph.nodes.find((node) => node.id === principalNodeId(ORDERS_READERS.id))
    expect(group).toMatchObject({ members: 2, expanded: false })
    expect(graph.edges.map((edge) => edge.kind)).not.toContain('membership')
    expect(graph.edges.filter((edge) => edge.kind === 'route')).toHaveLength(2)
  })

  it('draws an expanded group’s direct members, greying out the ineffective one', () => {
    const graph = graphElements(model(), new Set([ORDERS_READERS.id]))
    const members = graph.nodes.filter((node) => node.column === 0).map(nodeTitle)
    expect(members.sort()).toEqual(['Alice Andersson', 'id-contoso-reporting'])
    const memberships = graph.edges.filter((edge) => edge.kind === 'membership')
    expect(memberships.map((edge) => [edge.effective, edge.label])).toEqual([
      [true, undefined],
      [false, 'not effective'],
    ])
    expect(memberships.every((edge) => edge.target === principalNodeId(ORDERS_READERS.id))).toBe(
      true,
    )
  })

  it('labels grants with the roles held and routes with the outbound auth', () => {
    const { edges } = graphElements(model(), new Set())
    expect(edges.find((edge) => edge.kind === 'grant')?.label).toBe('Orders.Read')
    expect(edges.find((edge) => edge.kind === 'route')?.label).toBe('managed identity')
  })
})

describe('layoutGraph', () => {
  it('places each column to the right of the one before', async () => {
    const graph = graphElements(model(), new Set([ORDERS_READERS.id]))
    const positions = await layoutGraph(graph)
    const x = (column: number) =>
      graph.nodes
        .filter((node) => node.column === column)
        .map((node) => positions.get(node.id)?.x ?? NaN)
    expect(positions.size).toBe(graph.nodes.length)
    for (const column of [0, 1, 2]) {
      expect(Math.max(...x(column))).toBeLessThan(Math.min(...x(column + 1)))
    }
  })
})

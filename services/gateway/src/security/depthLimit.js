// Regla de validación: rechaza consultas anidadas en exceso (DoS por
// consultas recursivas/costosas), antes de ejecutar un solo resolver.
import { GraphQLError, Kind } from 'graphql';

export function depthLimit(maxDepth) {
  return (context) => {
    const fragments = Object.fromEntries(
      context
        .getDocument()
        .definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION)
        .map((d) => [d.name.value, d]),
    );

    const measure = (selectionSet, depth, seen) => {
      if (!selectionSet) return depth;
      let max = depth;
      for (const sel of selectionSet.selections) {
        if (sel.kind === Kind.FIELD) {
          max = Math.max(max, measure(sel.selectionSet, depth + 1, seen));
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, measure(sel.selectionSet, depth, seen));
        } else if (sel.kind === Kind.FRAGMENT_SPREAD && !seen.has(sel.name.value)) {
          const fragment = fragments[sel.name.value];
          if (fragment) max = Math.max(max, measure(fragment.selectionSet, depth, new Set([...seen, sel.name.value])));
        }
      }
      return max;
    };

    return {
      OperationDefinition(node) {
        const depth = measure(node.selectionSet, 0, new Set());
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`La consulta es demasiado profunda (${depth} > ${maxDepth})`, {
              nodes: [node],
              extensions: { code: 'QUERY_TOO_DEEP' },
            }),
          );
        }
      },
    };
  };
}

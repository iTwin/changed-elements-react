import { VisibilityTree, VisibilityTreeRenderer } from "@itwin/tree-widget-react";
import { ComponentPropsWithoutRef } from "react";

export type CustomModelsTreeRendererProps = Parameters<ComponentPropsWithoutRef<typeof VisibilityTree>["treeRenderer"]>[0];
export type CreateNodeLabelComponentProps = Required<ComponentPropsWithoutRef<typeof VisibilityTreeRenderer>>["getLabel"];
export type PresentationHierarchyNode = Parameters<CreateNodeLabelComponentProps>[0];
export type HierarchyNode = PresentationHierarchyNode["nodeData"];
export type NodeType = "subject" | "model" | "category" | "element" | "class-grouping";

export * from "./modelsTreeAndNodeTypes";

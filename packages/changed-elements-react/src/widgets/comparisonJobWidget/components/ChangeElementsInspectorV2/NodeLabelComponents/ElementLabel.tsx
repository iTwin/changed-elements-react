import { ProgressRadial } from "@itwin/itwinui-react";

export type ColorClasses = "added" | "modified" | "";

type ElementLabelProps = {
  color: ColorClasses;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalLabel: React.ReactElement<any, string | React.JSXElementConstructor<any>> | undefined;
  loading?: boolean;
};

export function ElementLabel(props: Readonly<ElementLabelProps>) {
  return (
    <>
      {props.loading && <ProgressRadial size="small"></ProgressRadial >}
      <div
        className={`circle ${props.color}`}
      ></div>
      <span className="node-label">{props.originalLabel}</span>
    </>
  );
}

export default ElementLabel;

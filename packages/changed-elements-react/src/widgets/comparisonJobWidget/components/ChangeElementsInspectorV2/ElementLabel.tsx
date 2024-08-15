
export type ColorClasses = "added" | "modified" | "";

type ElementLabelProps = {
  color: ColorClasses;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalLabel: React.ReactElement<any, string | React.JSXElementConstructor<any>> | undefined;
};

export function ElementLabel(props: Readonly<ElementLabelProps>) {
  return (
    <>
      <div
        className={`circle ${props.color}`}
      ></div>
      <span className="node-label">{props.originalLabel}</span>
    </>
  );
}

export default ElementLabel;

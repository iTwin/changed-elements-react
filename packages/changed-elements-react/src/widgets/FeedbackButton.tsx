/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgSmileyHappy } from "@itwin/itwinui-icons-react";
import { Button } from "@itwin/itwinui-react";
import { IModelApp } from "@itwin/core-frontend";
import "./FeedbackButton.scss";

interface Props {
  /** Link for button to take you to.*/
  feedbackUrl: string;
  "data-testId" ?: string;
}

/** Feedback button that on click takes you to provided link.*/
export function FeedbackButton(props: Props) {
  return (
    <Button
      as="a"
      className="changed-elems-feedback-btn"
      styleType="high-visibility"
      href={props.feedbackUrl}
      target="_blank"
      rel="noreferrer"
      data-testid={props["data-testId"]}
    >
      <div className="changed-elems-feedback-content-wrapper">
        <SvgSmileyHappy className="changed-elems-feedback-svg" />
        {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareLeaveFeedback")}
      </div>
    </Button>
  );
}

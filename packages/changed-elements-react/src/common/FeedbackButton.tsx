import { SvgSmileyHappy } from "@itwin/itwinui-icons-react";
import { Button, Text } from "@itwin/itwinui-react";
import './FeedbackButton.scss';

interface Props{
  feedbackLink: string;
}

export function FeedbackButton(props:Props){
  return (
    <a href={props.feedbackLink} target="_blank">
      <Button styleType='high-visibility' className="button">
        <SvgSmileyHappy className="svg"></SvgSmileyHappy>
        <Text className="text">Leave Feedback</Text>
      </Button>
    </a>);
}

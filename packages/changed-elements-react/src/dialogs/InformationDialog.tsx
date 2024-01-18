
// import * as ReactDOM from 'react-dom';
import { Dialog } from '@itwin/itwinui-react';
import { ReactNode } from 'react';
import "./InformationDialog.scss";

interface Props{
  information: string | ReactNode;
  title: string | ReactNode;
  onClose: (() => void);
}

const InfoDialog = (props: Props) => {
  return (
    <>
      <Dialog
        isOpen
        onClose={props.onClose}
        closeOnEsc
        closeOnExternalClick
        preventDocumentScroll
        trapFocus
        setFocus
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main>
          <Dialog.TitleBar titleText={props.title} />
          <Dialog.Content className='dialog-content'>
            {props.information}
          </Dialog.Content>
        </Dialog.Main>
      </Dialog>
    </>
  );
};

export default InfoDialog;

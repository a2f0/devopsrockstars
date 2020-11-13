import React from 'react'
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(() => ({	
  flexContainerRow: {	
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%'
  },
}));

const FlexContainerRow = function (props: any) {
  const classes = useStyles();
  return (
    <div
      className={classes.flexContainerRow}>
      {props.children}
    </div>
  )
}
export default FlexContainerRow
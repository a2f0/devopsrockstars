
import React, {useEffect, useState} from 'react'
import { TechtagSection } from "./models"

const Company = React.memo(function FullScreenMap(props) {

  const [techtagSections, setTechtagSections] = useState([] as TechtagSection[])

  useEffect(() => {
    retrieveEntries();
  }, []);

  const retrieveEntries = () => {
    const fetchData = async () => {
      TechtagSection.all().then((response) => {
        console.info(response.data)
        setTechtagSections(response.data)
      })
    }
    fetchData();
  }

  return (
    <div>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
    </div>
  );

});

export default Company

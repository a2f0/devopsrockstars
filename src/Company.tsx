
import React, {useEffect, useState} from 'react'
import { TechtagSection } from "./models"
import { ReactSVG } from 'react-svg'

const Company = React.memo(function Company(props) {

  const [techtagSections, setTechtagSections] = useState([] as TechtagSection[])

  useEffect(() => {
    retrieveEntries();
  }, []);

  const retrieveEntries = () => {
    const fetchData = async () => {
      TechtagSection.includes('techtags').all().then((response) => {
        setTechtagSections(response.data)
      })
    }
    fetchData();
  }

  const techtag = {  
    display: "inline-block",
    width: "30px",
    paddingRight: "4px",
    verticalAlign: "middle"
  };

  return (
    
    <div>
      {techtagSections.map((entry) => {
        return (
  
          <div key={'section-' + entry.id}>
            <div>
            { entry.title }
            </div>
            {entry.techtags.map((tag) => {
              return (
                <div key={'tag-' + tag.id} style={techtag}>
                    <ReactSVG
                      src={tag.fullUrl}
                      beforeInjection={(svg) => {
                        svg.classList.add('svg-class-name');
                        svg.setAttribute('style', 'width: 30px');
                      }}
                    />
                </div>
              )
            })}    
          </div>
        )
      })}
    </div>
  );

});

export default Company

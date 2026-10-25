import React from 'react';
import styled from 'styled-components';
import ContactRow from './ContactRow';
import FlexContainerColumn from './styled-components/FlexContainerColumn';

const ContactRowContainer = styled.div`
  margin-top: 10px;
`;

const Company = React.memo(() => {
  return (
    <FlexContainerColumn data-ct-app="company">
      <h1>Contact</h1>
      <p>Get in touch about DevOps consulting.</p>
      <ContactRowContainer>
        <ContactRow
          svgHeight={20}
          svgWidth={20}
          svgPath={'/static/image/contact/email.svg'}
          uri={'mailto:info@devopsrockstars.com'}
          rowDescription={'info [at] devopsrockstars.com'}
        />
        <ContactRow
          svgHeight={20}
          svgWidth={20}
          svgPath={'/static/image/contact/vcard.svg'}
          uri={'/static/contact/devopsrockstars.vcf'}
          rowDescription={'vCard'}
        />
        <ContactRow
          svgHeight={20}
          svgWidth={20}
          svgPath={'/static/image/contact/key.svg'}
          uri={'/static/contact/pgp.asc'}
          rowDescription={'GnuPG'}
        />
      </ContactRowContainer>
    </FlexContainerColumn>
  );
});

export default Company;

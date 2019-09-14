import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";
import './style/devopsrockstars.less';

function Index () {
    return <h2>Home</h2>;
}

function Company () {
    return <h2>Company</h2>;
}

function Store () {
    return <h2>Store</h2>;
}

function Contact () {
    return <h2>Contact</h2>;
}

function AppRouter () {
    return (
        <Router>
            <div>
                <nav>
                    <div className="menu-item">
                        <Link to="/">Index</Link>
                    </div>
                    <div className="menu-item">
                        <Link to="/company/">Company</Link>
                    </div>
                    <div className="menu-item">
                        <Link to="/store/">Store</Link>
                    </div>
                    <div className="menu-item">
                        <Link to="/contact/">Contact</Link>
                    </div>
                </nav>
                <Route path="/" exact component={Index} />
                <Route path="/company/" exact component={Company} />
                <Route path="/store/" component={Store} />
                <Route path="/contact/" component={Contact} />
            </div>
        </Router>
    );
}
ReactDOM.render(<AppRouter />, document.getElementById("root"));

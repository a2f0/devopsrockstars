import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";

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
                    <ul>
                        <li>
                            <Link to="/">Index</Link>
                        </li>
                        <li>
                            <Link to="/company/">Company</Link>
                        </li>
                        <li>
                            <Link to="/store/">Store</Link>
                        </li>
                        <li>
                            <Link to="/contact/">Contact</Link>
                        </li>
                    </ul>
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
